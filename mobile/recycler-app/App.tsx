import React from 'react';

import AccountScreen from './src/core/AccountScreen';
import type { RegisterExtraProps } from './src/core/AuthScreens';
import { t } from './src/core/i18n';
import Root from './src/core/Root';
import { Input } from './src/core/ui';
import ImpactScreen from './src/screens/ImpactScreen';
import LotScreen from './src/screens/LotScreen';
import MarketScreen from './src/screens/MarketScreen';
import MyLotsScreen from './src/screens/MyLotsScreen';

function RegisterExtra({ data, set }: RegisterExtraProps) {
  return <Input label={t('reg.company')} icon="briefcase-outline" value={data.organization ?? ''} onChangeText={(v) => set('organization', v)} placeholder="Vellore Scrap Traders" />;
}

const Account = () => <AccountScreen />;

export default function App() {
  return (
    <Root
      RegisterExtra={RegisterExtra}
      tabs={[
        { key: 'market', title: 'tab.market', icon: 'storefront', component: MarketScreen },
        { key: 'mine', title: 'tab.myLots', icon: 'cube', component: MyLotsScreen },
        { key: 'impact', title: 'tab.impact', icon: 'stats-chart', component: ImpactScreen },
        { key: 'account', title: 'tab.account', icon: 'person-circle', component: Account },
      ]}
      screens={{ Lot: LotScreen }}
    />
  );
}
