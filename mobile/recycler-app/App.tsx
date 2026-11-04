import React, { useState } from 'react';
import { Text } from 'react-native';

import AccountScreen from './src/core/AccountScreen';
import { getCurrentLocation } from './src/core/device';
import Root from './src/core/Root';
import { colors, font } from './src/core/theme';
import { Button, Input } from './src/core/ui';
import ImpactScreen from './src/screens/ImpactScreen';
import LotScreen from './src/screens/LotScreen';
import MarketScreen from './src/screens/MarketScreen';
import MyLotsScreen from './src/screens/MyLotsScreen';

function RegisterExtra({ data, set }: { data: Record<string, any>; set: (k: string, v: any) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Input label="Company / shop name" value={data.organization ?? ''} onChangeText={(v) => set('organization', v)} placeholder="e.g. Vellore Scrap Traders" />
      <Input label="Yard address" value={data.address ?? ''} onChangeText={(v) => set('address', v)} placeholder="Street, area" />
      <Button
        title={data.lat ? 'Yard location saved ✔' : 'Use my current location as yard'}
        icon="locate"
        small
        variant="secondary"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          const p = await getCurrentLocation();
          if (p) {
            set('lat', p.lat);
            set('lng', p.lng);
          }
          setBusy(false);
        }}
      />
      <Text style={[font.small, { color: colors.textMuted, marginTop: 6, marginBottom: 12 }]}>Used to sort lots by distance from you.</Text>
    </>
  );
}

const Account = () => <AccountScreen />;

export default function App() {
  return (
    <Root
      RegisterExtra={RegisterExtra}
      tabs={[
        { key: 'market', title: 'Market', icon: 'storefront', component: MarketScreen },
        { key: 'mine', title: 'My lots', icon: 'cube', component: MyLotsScreen },
        { key: 'impact', title: 'Impact', icon: 'stats-chart', component: ImpactScreen },
        { key: 'account', title: 'Account', icon: 'person-circle', component: Account },
      ]}
      screens={{ Lot: LotScreen }}
    />
  );
}
