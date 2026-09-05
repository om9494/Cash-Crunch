import { useState } from 'react';
import NavBar from './components/NavBar.jsx';
import MerchantList   from './pages/MerchantList.jsx';
import MerchantDetail from './pages/MerchantDetail.jsx';
import AccuracyReport from './pages/AccuracyReport.jsx';
import { colors } from './theme.js';

/**
 * App — top-level router via state (no react-router dependency).
 * Views: 'fleet' | 'detail' | 'accuracy'
 */
export default function App() {
  const [tab, setTab]                   = useState('fleet');   // 'fleet' | 'accuracy'
  const [selectedMerchant, setSelected] = useState(null);      // { id, name }

  function handleSelectMerchant(id, name) {
    setSelected({ id, name });
    setTab('fleet'); // keep tab consistent
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
