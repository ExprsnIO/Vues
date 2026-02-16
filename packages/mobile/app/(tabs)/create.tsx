import { useState, useRef } from 'react';
import { View, Text, Pressable, SafeAreaView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';

export default function CreateScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [cameraType, setCameraType] = useState<CameraType>('back');
  const cameraRef = useRef<CameraView>(null);

  // Redirect to login if not authenticated
  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-black items-center justify-center px-6">
        <Ionicons name="videocam-outline" size={64} color="#71717a" />
        <Text className="text-white text-xl font-semibold mt-4 mb-2">
          Sign in to create
        </Text>
        <Text className="text-zinc-500 text-center mb-6">
          You need to sign in to record and upload videos
        </Text>
        <Pressable
          onPress={() => router.push('/login')}
          className="bg-primary-500 px-8 py-3 rounded-lg"
        >
          <Text className="text-white font-semibold text-base">Sign in</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return (
      <SafeAreaView className="flex-1 bg-black items-center justify-center">
        <Text className="text-white">Loading...</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 bg-black items-center justify-center px-6">
        <Ionicons name="camera-outline" size={64} color="#71717a" />
        <Text className="text-white text-xl font-semibold mt-4 mb-2">
          Camera access needed
        </Text>
        <Text className="text-zinc-500 text-center mb-6">
          Exprsn needs camera access to record videos
        </Text>
        <Pressable
          onPress={requestPermission}
          className="bg-primary-500 px-8 py-3 rounded-lg"
        >
          <Text className="text-white font-semibold text-base">
            Grant access
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const handleStartRecording = async () => {
    if (!cameraRef.current) return;

    setIsRecording(true);
    try {
      const video = await cameraRef.current.recordAsync({
        maxDuration: 180,
      });
      if (video) {
        router.push({
          pathname: '/edit',
          params: { videoUri: video.uri },
        });
      }
    } catch (error) {
      console.error('Recording error:', error);
      Alert.alert('Error', 'Failed to record video');
    }
    setIsRecording(false);
  };

  const handleStopRecording = () => {
    if (cameraRef.current && isRecording) {
      cameraRef.current.stopRecording();
    }
  };

  const handlePickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 1,
      videoMaxDuration: 180,
    });

    if (!result.canceled && result.assets[0]) {
      router.push({
        pathname: '/edit',
        params: { videoUri: result.assets[0].uri },
      });
    }
  };

  const toggleCameraType = () => {
    setCameraType((current) => (current === 'back' ? 'front' : 'back'));
  };

  return (
    <View className="flex-1 bg-black">
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing={cameraType}
        mode="video"
      >
        {/* Top controls */}
        <SafeAreaView className="flex-row justify-between items-center px-4 pt-2">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 items-center justify-center"
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <View className="flex-row gap-4">
            <Pressable
              onPress={toggleCameraType}
              className="w-10 h-10 items-center justify-center"
            >
              <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
            </Pressable>
          </View>
        </SafeAreaView>

        {/* Bottom controls */}
        <View className="absolute bottom-0 left-0 right-0 pb-10">
          <View className="flex-row items-center justify-center gap-8">
            {/* Gallery */}
            <Pressable
              onPress={handlePickVideo}
              className="w-12 h-12 bg-zinc-800 rounded-lg items-center justify-center"
            >
              <Ionicons name="images-outline" size={24} color="#fff" />
            </Pressable>

            {/* Record button */}
            <Pressable
              onPressIn={handleStartRecording}
              onPressOut={handleStopRecording}
              className={`w-20 h-20 rounded-full border-4 border-white items-center justify-center ${
                isRecording ? 'bg-red-500' : 'bg-transparent'
              }`}
            >
              {isRecording && (
                <View className="w-8 h-8 bg-red-500 rounded-md" />
              )}
            </Pressable>

            {/* Placeholder for symmetry */}
            <View className="w-12 h-12" />
          </View>
        </View>
      </CameraView>
    </View>
  );
}
