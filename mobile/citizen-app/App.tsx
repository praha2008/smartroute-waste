import React from 'react';
import { Text } from 'react-native';

import { WARDS } from './src/appConfig';
import AccountScreen from './src/core/AccountScreen';
import Root from './src/core/Root';
import { font, space } from './src/core/theme';
import { Chip, Input, Row, Segmented } from './src/core/ui';
import HomeScreen from './src/screens/HomeScreen';
import NewRequestScreen from './src/screens/NewRequestScreen';
import RequestDetailScreen from './src/screens/RequestDetailScreen';
import RequestsScreen from './src/screens/RequestsScreen';
import RewardsScreen from './src/screens/RewardsScreen';

function RegisterExtra({ data, set }: { data: Record<string, any>; set: (k: string, v: any) => void }) {
  const type = data.account_type ?? 'household';
  return (
    <>
      <Text style={[font.small, { marginBottom: 6, fontWeight: '600' }]}>Account type</Text>
      <Segmented
        value={type}
        onChange={(v) => set('account_type', v)}
        options={[
          { value: 'household', label: 'Household' },
          { value: 'business', label: 'Business' },
        ]}
      />
      <Row style={{ height: space.md }}>{null}</Row>
      {type === 'business' && (
        <Input label="Business name" value={data.organization ?? ''} onChangeText={(v) => set('organization', v)} placeholder="e.g. Hotel Annapoorna" />
      )}
      <Text style={[font.small, { marginBottom: 6, fontWeight: '600' }]}>Ward / area</Text>
      <Row style={{ flexWrap: 'wrap', marginBottom: space.md }} gap={6}>
        {WARDS.map((w) => (
          <Chip key={w} label={w} active={data.ward === w} onPress={() => set('ward', w)} />
        ))}
      </Row>
      <Input label="Address" value={data.address ?? ''} onChangeText={(v) => set('address', v)} placeholder="Door no, street" />
    </>
  );
}

export default function App() {
  return (
    <Root
      RegisterExtra={RegisterExtra}
      tabs={[
        { key: 'home', title: 'Home', icon: 'home', component: HomeScreen },
        { key: 'requests', title: 'Pickups', icon: 'list', component: RequestsScreen },
        { key: 'rewards', title: 'Rewards', icon: 'gift', component: RewardsScreen },
        { key: 'account', title: 'Account', icon: 'person-circle', component: () => <AccountScreen /> },
      ]}
      screens={{ NewRequest: NewRequestScreen, RequestDetail: RequestDetailScreen }}
    />
  );
}
