import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';

import { ErrorBoundary } from '@/components/core/ErrorBoundary';
import { NetworkMonitor } from '@/components/core/NetworkMonitor';

import { initDynamicTokenLists } from './modules/evm/utils/Chainregistry';
import { WalletListModal } from './modules/walletconnect/components/WalletListModal';
import {
  initWalletListener,
  useWalletStore,
} from './modules/walletconnect/store/walletConnectStore';
import router from './routes';
import { ensureSwiftExDeviceAuth } from './service/deviceService';
import { useAppAvailabilityStore } from './store/appAvailabilityStore';
import { useGeolocationStore } from './store/geolocationStore';

let hasPrintedSecurityWarning = false;

const printSecurityWarning = () => {
  if (hasPrintedSecurityWarning) return;

  const isExplicitlyDisabled = import.meta.env.VITE_ENABLE_SECURITY_WARNING === 'false';
  const isEnabled = !isExplicitlyDisabled;

  if (isEnabled) {
    hasPrintedSecurityWarning = true;
    console.log(
      '%cStop!',
      'color: red; font-size: 60px; font-weight: bold; text-shadow: 2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000;'
    );
    console.log(
      "%cThis is a browser feature intended for developers.\nIf someone told you to copy-paste something here to enable a feature or 'hack' someone's account, it is a scam and will give them access to your SwiftEx wallet and funds.",
      'font-size: 18px; font-weight: bold; color: white;'
    );
    console.log(
      '%cSee https://en.wikipedia.org/wiki/Self-XSS for more information.',
      'font-size: 16px; color: #3b82f6;'
    );
  }
};

printSecurityWarning();

const App = () => {
  const session = useWalletStore(state => state.session);
  const peerMeta = session?.peer?.metadata;

  useEffect(() => {
    printSecurityWarning();
    initWalletListener();
    initDynamicTokenLists();
    useGeolocationStore.getState().fetchLocation();
    useAppAvailabilityStore.getState().fetchAvailability();
  }, []);

  useEffect(() => {
    void ensureSwiftExDeviceAuth(peerMeta);
  }, [peerMeta]);

  return (
    <ErrorBoundary>
      <NetworkMonitor />
      <WalletListModal />
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
};

export default App;
