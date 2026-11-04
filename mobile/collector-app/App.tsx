import React from 'react';

import AccountScreen from './src/core/AccountScreen';
import Root from './src/core/Root';
import HistoryScreen from './src/screens/HistoryScreen';
import RouteScreen from './src/screens/RouteScreen';
import StopScreen from './src/screens/StopScreen';

const Account = () => <AccountScreen />;

export default function App() {
  return (
    <Root
      tabs={[
        { key: 'route', title: 'Route', icon: 'navigate', component: RouteScreen },
        { key: 'history', title: 'History', icon: 'time', component: HistoryScreen },
        { key: 'account', title: 'Account', icon: 'person-circle', component: Account },
      ]}
      screens={{ Stop: StopScreen }}
    />
  );
}
