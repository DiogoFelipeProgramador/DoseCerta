import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useTheme } from '../theme/themeContext';
import { HomeScreen } from '../screens/HomeScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { AddMedicationScreen } from '../screens/AddMedicationScreen';
import { CaregiverScreen } from '../screens/CaregiverScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { AIFloatingButton } from '../components/AIFloatingButton';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const Tab = createBottomTabNavigator();

interface BottomTabNavigatorProps {
  onResetOnboarding: () => void;
}

export const BottomTabNavigator: React.FC<BottomTabNavigatorProps> = ({ onResetOnboarding }) => {
  const { colors, typography } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.cardBackground,
          borderTopColor: colors.border,
          borderTopWidth: 1.5,
          // Web gets a bit more room: the "Novo" circle and its label sit inside the bar there
          height: Platform.OS === 'ios' ? 88 : Platform.OS === 'web' ? 80 : 72,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          paddingTop: 8,
        },
        // On wide browser windows the tabs default to label beside the icon, which breaks the "Novo" button
        tabBarLabelPosition: 'below-icon',
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: typography.caption.fontSize - 1,
          fontWeight: '600',
        },
      }}
      screenLayout={({ children, route, navigation }) => (
        <View style={{ flex: 1 }}>
          {children}
          {route.name !== 'CadastrarTab' && (
            <AIFloatingButton onPress={() => navigation.navigate('AIAssistant')} />
          )}
        </View>
      )}
      screenListeners={{
        tabPress: () => {
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        },
      }}
    >
      <Tab.Screen
        name="InicioTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Início',
          tabBarIcon: ({ color, size, focused }) => (
            <Feather name="home" size={24} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="HistoricoTab"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'Histórico',
          tabBarIcon: ({ color, size, focused }) => (
            <Feather name="calendar" size={24} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="CadastrarTab"
        component={AddMedicationScreen}
        options={{
          tabBarLabel: 'Novo',
          tabBarLabelStyle: {
            fontSize: typography.caption.fontSize - 1,
            fontWeight: '700',
            // On web the circle sits inside the bar, right on top of the label
            ...(Platform.OS === 'web' && { marginTop: 6 }),
          },
          tabBarIcon: ({ color, size, focused }) => (
            <View
              style={[
                styles.addTabIcon,
                Platform.OS === 'web' && styles.addTabIconWeb,
                {
                  backgroundColor: colors.primary,
                  borderColor: colors.cardBackground,
                },
              ]}
            >
              <Ionicons name="add" size={32} color="#FFFFFF" />
            </View>
          ),
        }}
      />

      <Tab.Screen
        name="CuidadorTab"
        component={CaregiverScreen}
        options={{
          tabBarLabel: 'Cuidador',
          tabBarIcon: ({ color, size, focused }) => (
            <Feather name="users" size={24} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="PerfilTab"
        options={{
          tabBarLabel: 'Perfil',
          tabBarIcon: ({ color, size, focused }) => (
            <Feather name="user" size={24} color={color} />
          ),
        }}
      >
        {(props) => <ProfileScreen {...props} onResetOnboarding={onResetOnboarding} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  addTabIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -26,
    borderWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  // The browser clips the raised circle at the tab bar's edge, so on web it sits inside the bar
  addTabIconWeb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginTop: 0,
    borderWidth: 0,
  },
});

