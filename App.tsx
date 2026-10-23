import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from './src/theme/themeContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { FeedbackProvider } from './src/components/FeedbackProvider';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <FeedbackProvider>
          <StatusBar style="dark" />
          <AppNavigator />
        </FeedbackProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
