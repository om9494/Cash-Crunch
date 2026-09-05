import { useState } from 'react';
import NavBar from '../components/NavBar.jsx';
import MerchantList   from './MerchantList.jsx';
import MerchantDetail from './MerchantDetail.jsx';
import AccuracyReport from './AccuracyReport.jsx';
import { colors } from '../theme.js';

/**
 * Dashboard — the existing fleet/merchant/accuracy views, now served at /app.
 * Logic unchanged from original App.jsx.
 */
export default function Dashboard() {
  const [tab, setTab]                   = useState('fleet');
  const [selectedMerchant, setSelected] = useState(null);

  function handleSelectMerchant(id, name) {
    setSelected({ id, name });
    setTab('fleet');
  }

  function handleBack() {
    setSelected(null);
  }

  function handleTabChange(newTab) {
    setTab(newTab);
    if (newTab !== 'fleet') setSelected(null);
  }

  const showDetail   = tab === 'fleet' && !!selectedMerchant;
  const showFleet    = tab === 'fleet' && !selectedMerchant;
  const showAccuracy = tab === 'accuracy';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.void,
        color: colors.textPrimary,
      }}
    >
      <NavBar
        activeTab={tab}
        onTabChange={handleTabChange}
        merchantName={showDetail ? selectedMerchant?.name : null}
      />

      <main>
        {showFleet && (
          <MerchantList
            onSelectMerchant={(id, name) => handleSelectMerchant(id, name || id)}
          />
        )}
        {showDetail && (
          <MerchantDetail
            merchantId={selectedMerchant.id}
            onBack={handleBack}
          />
        )}
        {showAccuracy && <AccuracyReport />}
      </main>
    </div>
  );
}
