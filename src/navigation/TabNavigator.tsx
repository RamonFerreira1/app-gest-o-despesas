import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fontSize } from '../theme';
import DashboardScreen from '../screens/DashboardScreen';
import NewExpenseScreen from '../screens/NewExpenseScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ChatAssistantScreen from '../screens/ChatAssistantScreen';
import ReportsScreen from '../screens/ReportsScreen';
import BudgetScreen from '../screens/BudgetScreen';

const Tab = createBottomTabNavigator();

function CustomTabBar({ state, descriptors, navigation }: any) {
  return (
    <View style={styles.tabBar}>
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const isCenter = route.name === 'NewExpense';

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        if (isCenter) {
          return (
            <TouchableOpacity
              key={route.key}
              style={styles.centerBtn}
              onPress={onPress}
              activeOpacity={0.85}
            >
              <View style={styles.centerBtnInner}>
                <Ionicons name="add" size={28} color={colors.background} />
              </View>
            </TouchableOpacity>
          );
        }

        const iconMap: Record<string, any> = {
          Dashboard: isFocused ? 'grid' : 'grid-outline',
          Budget: isFocused ? 'wallet' : 'wallet-outline',
          Reports: isFocused ? 'bar-chart' : 'bar-chart-outline',
          History: isFocused ? 'list' : 'list-outline',
          ChatAI: isFocused ? 'sparkles' : 'sparkles-outline',
          Settings: isFocused ? 'settings' : 'settings-outline',
        };

        const labelMap: Record<string, string> = {
          Dashboard: 'Início',
          Budget: 'Orçamento',
          Reports: 'Relatórios',
          History: 'Histórico',
          ChatAI: 'IA Chat',
          Settings: 'Config',
        };

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.tabItem}
            onPress={onPress}
            activeOpacity={0.7}
          >
            <Ionicons
              name={iconMap[route.name] ?? 'ellipse-outline'}
              size={21}
              color={isFocused ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
              {labelMap[route.name] ?? route.name}
            </Text>
            {isFocused && <View style={styles.activeDot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Budget" component={BudgetScreen} />
      <Tab.Screen name="NewExpense" component={NewExpenseScreen} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="ChatAI" component={ChatAssistantScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingBottom: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    gap: 2,
  },
  tabLabel: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginTop: 1,
  },
  centerBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  centerBtnInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
});
