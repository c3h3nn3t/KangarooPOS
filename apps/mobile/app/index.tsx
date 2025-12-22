import { Redirect } from 'expo-router';

export default function Index() {
  // TODO: Check if user is logged in
  const isLoggedIn = true; // Mock for now

  if (!isLoggedIn) {
    return <Redirect href="/login" />;
  }

  return <Redirect href="/(tabs)/pos" />;
}
