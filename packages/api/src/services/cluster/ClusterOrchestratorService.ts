/**
 * Cluster Orchestrator Service
 * Handles Kubernetes and Docker cluster operations
 */

import { db } from '../../db/index.js';
import { renderClusters, renderWorkers } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Kubernetes scaling result
 */
export interface ScaleResult {
  success: boolean;
  previousReplicas?: number;
  newReplicas: number;
  error?: string;
}

/**
 * Pod/Container restart result
 */
export interface RestartResult {
  success: boolean;
  workerId: string;
  error?: string;
}

/**
 * Cluster metrics from Kubernetes/Docker
 */
export interface ClusterMetrics {
  readyReplicas: number;
  desiredReplicas: number;
  availableReplicas: number;
  cpuUsage?: number;
  memoryUsage?: number;
  gpuUtilization?: number;
}

/**
 * Cluster Orchestrator Service
 */
export class ClusterOrchestratorService {
  private static instance: ClusterOrchestratorService | null = null;

  static getInstance(): ClusterOrchestratorService {
    if (!ClusterOrchestratorService.instance) {
      ClusterOrchestratorService.instance = new ClusterOrchestratorService();
    }
    return ClusterOrchestratorService.instance;
  }

  /**
   * Scale a Kubernetes deployment
   */
  async scaleKubernetesDeployment(
    clusterId: string,
    replicas: number
  ): Promise<ScaleResult> {
    const [cluster] = await db
      .select()
      .from(renderClusters)
      .where(eq(renderClusters.id, clusterId))
      .limit(1);

    if (!cluster) {
      return { success: false, newReplicas: 0, error: 'Cluster not found' };
    }

    if (cluster.type !== 'kubernetes') {
      return { success: false, newReplicas: 0, error: 'Not a Kubernetes cluster' };
    }

    const apiUrl = cluster.endpoint || process.env.KUBERNETES_API_URL;
    const token = process.env.KUBERNETES_TOKEN;
    const namespace = process.env.KUBERNETES_NAMESPACE || 'default';
    const deploymentName = process.env.RENDER_WORKER_DEPLOYMENT || 'render-worker';

    if (!apiUrl) {
      return { success: false, newReplicas: replicas, error: 'Kubernetes API URL not configured' };
    }

    try {
      // Get current deployment
      const getResponse = await fetch(
        `${apiUrl}/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!getResponse.ok) {
        throw new Error(`Failed to get deployment: ${getResponse.status}`);
      }

      const deployment = await getResponse.json() as {
        spec: { replicas: number };
        metadata: { resourceVersion: string };
      };
      const previousReplicas = deployment.spec.replicas;

      // Scale the deployment using PATCH
      const patchBody = {
        spec: {
          replicas: replicas,
        },
      };

      const patchResponse = await fetch(
        `${apiUrl}/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/strategic-merge-patch+json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(patchBody),
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!patchResponse.ok) {
        const errorText = await patchResponse.text();
        throw new Error(`Failed to scale deployment: ${patchResponse.status} - ${errorText}`);
      }

      // Update cluster record
      await db
        .update(renderClusters)
        .set({
          maxWorkers: replicas,
          updatedAt: new Date(),
        })
        .where(eq(renderClusters.id, clusterId));

      console.log(
        `[ClusterOrchestrator] Scaled ${deploymentName} from ${previousReplicas} to ${replicas} replicas`
      );

      return {
        success: true,
        previousReplicas,
        newReplicas: replicas,
      };
    } catch (error) {
      console.error('[ClusterOrchestrator] Kubernetes scaling failed:', error);

      // Still update the DB to reflect desired state
      await db
        .update(renderClusters)
        .set({
          maxWorkers: replicas,
          updatedAt: new Date(),
        })
        .where(eq(renderClusters.id, clusterId));

      return {
        success: false,
        newReplicas: replicas,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Restart a Kubernetes pod
   */
  async restartKubernetesPod(
    workerId: string,
    podName: string
  ): Promise<RestartResult> {
    const namespace = process.env.KUBERNETES_NAMESPACE || 'default';
    const apiUrl = process.env.KUBERNETES_API_URL;
    const token = process.env.KUBERNETES_TOKEN;

    if (!apiUrl) {
      return { success: false, workerId, error: 'Kubernetes API URL not configured' };
    }

    try {
      // Delete the pod - Kubernetes will recreate it due to deployment
      const response = await fetch(
        `${apiUrl}/api/v1/namespaces/${namespace}/pods/${podName}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to delete pod: ${response.status}`);
      }

      // Mark worker as offline - it will re-register when the new pod starts
      await db
        .update(renderWorkers)
        .set({
          status: 'offline',
          lastHeartbeat: new Date(0),
        })
        .where(eq(renderWorkers.id, workerId));

      console.log(`[ClusterOrchestrator] Restarted Kubernetes pod ${podName}`);

      return { success: true, workerId };
    } catch (error) {
      console.error('[ClusterOrchestrator] Failed to restart Kubernetes pod:', error);
      return {
        success: false,
        workerId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Restart a Docker container
   */
  async restartDockerContainer(
    workerId: string,
    containerId: string
  ): Promise<RestartResult> {
    const dockerHost = process.env.DOCKER_HOST || 'unix:///var/run/docker.sock';

    // Only support HTTP-based Docker API for remote restarts
    if (!dockerHost.startsWith('http')) {
      // For unix socket, we'd need a different approach (exec docker restart)
      console.warn('[ClusterOrchestrator] Docker unix socket not supported for remote restart');

      // Mark worker as offline
      await db
        .update(renderWorkers)
        .set({
          status: 'offline',
          lastHeartbeat: new Date(0),
        })
        .where(eq(renderWorkers.id, workerId));

      return {
        success: false,
        workerId,
        error: 'Docker unix socket restart not supported remotely',
      };
    }

    try {
      // Restart the container
      const response = await fetch(
        `${dockerHost}/containers/${containerId}/restart`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(30000), // Docker restart can take time
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to restart container: ${response.status}`);
      }

      // Mark worker as offline temporarily
      await db
        .update(renderWorkers)
        .set({
          status: 'offline',
          lastHeartbeat: new Date(0),
        })
        .where(eq(renderWorkers.id, workerId));

      console.log(`[ClusterOrchestrator] Restarted Docker container ${containerId}`);

      return { success: true, workerId };
    } catch (error) {
      console.error('[ClusterOrchestrator] Failed to restart Docker container:', error);
      return {
        success: false,
        workerId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get metrics from a Kubernetes deployment
   */
  async getKubernetesMetrics(clusterId: string): Promise<ClusterMetrics | null> {
    const [cluster] = await db
      .select()
      .from(renderClusters)
      .where(eq(renderClusters.id, clusterId))
      .limit(1);

    if (!cluster || cluster.type !== 'kubernetes') {
      return null;
    }

    const apiUrl = cluster.endpoint || process.env.KUBERNETES_API_URL;
    const token = process.env.KUBERNETES_TOKEN;
    const namespace = process.env.KUBERNETES_NAMESPACE || 'default';
    const deploymentName = process.env.RENDER_WORKER_DEPLOYMENT || 'render-worker';

    if (!apiUrl) {
      return null;
    }

    try {
      const response = await fetch(
        `${apiUrl}/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!response.ok) {
        return null;
      }

      const deployment = await response.json() as {
        spec: { replicas: number };
        status: {
          replicas?: number;
          readyReplicas?: number;
          availableReplicas?: number;
        };
      };

      return {
        desiredReplicas: deployment.spec.replicas,
        readyReplicas: deployment.status.readyReplicas || 0,
        availableReplicas: deployment.status.availableReplicas || 0,
      };
    } catch (error) {
      console.error('[ClusterOrchestrator] Failed to get Kubernetes metrics:', error);
      return null;
    }
  }

  /**
   * Get worker pod/container info from metadata
   */
  getWorkerContainerInfo(worker: typeof renderWorkers.$inferSelect): {
    podName?: string;
    containerId?: string;
  } {
    const metadata = worker.metadata as Record<string, unknown> | null;
    return {
      podName: metadata?.podName as string | undefined,
      containerId: metadata?.containerId as string | undefined,
    };
  }
}

// Export singleton getter
export function getClusterOrchestrator(): ClusterOrchestratorService {
  return ClusterOrchestratorService.getInstance();
}
