import { redirect } from 'next/navigation';

export default async function LegacyDomainUsersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/d/${id}/users`);
}
