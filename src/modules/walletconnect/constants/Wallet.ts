export const WalletType = {
  EVM: 'evm',
  STELLAR: 'stellar',
} as const;

export type WalletType = (typeof WalletType)[keyof typeof WalletType];

export interface WalletConfig {
  id: string;
  name: string;
  icon: string;
  type: WalletType;
  rdns?: string;
  injectedIds?: string[];
  wcListingId?: string;
  homepage?: string;
}

export const EVM_WALLETS: WalletConfig[] = [
  {
    id: 'swiftex',
    name: 'SwiftEx Wallet',
    icon: '/logo.png',
    type: WalletType.EVM,
    wcListingId: 'a4604022bf9199ca6d762c5663d8a6186a9ca4b607b9dcb29bcb81054d6f1091',
    homepage: 'https://swiftexchange.io/',
    injectedIds: ['isSwiftEx'],
  },
  {
    id: 'metamask',
    name: 'MetaMask',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT3ymr3UNKopfI0NmUY95Dr-0589vG-91KuAA&s',
    type: WalletType.EVM,
    rdns: 'io.metamask',
    wcListingId: 'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
    homepage: 'https://metamask.io/',
    injectedIds: ['isMetaMask'],
  },
  {
    id: 'trust',
    name: 'Trust Wallet',
    icon: 'https://play-lh.googleusercontent.com/cd5BevWohRqLwsI2_i3k4YIVtcO57cIZCs6l20H1Hcdj0P2rFEcX_7QtgKbTM3Sn_A',
    type: WalletType.EVM,
    rdns: 'com.trustwallet.app',
    wcListingId: '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0',
    homepage: 'https://trustwallet.com/',
    injectedIds: ['isTrust', 'isTrustWallet'],
  },
  {
    id: 'phantom',
    name: 'Phantom',
    icon: 'https://explorer-api.walletconnect.com/v3/logo/sm/b6ec7b81-bb4f-427d-e290-7631e6e50d00?projectId=fdde0f7f2696cc4d849103c23792d693',
    type: WalletType.EVM,
    rdns: 'app.phantom',
    wcListingId: 'a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393',
    homepage: 'https://phantom.app/',
    injectedIds: ['isPhantom'],
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRDU5aTw2FNop7OonFBOXEeAXb1biSQbBr6Ew&s',
    type: WalletType.EVM,
    rdns: 'me.rainbow',
    homepage: 'https://rainbow.me/',
    injectedIds: ['isRainbow'],
  },
  {
    id: 'walletconnect',
    name: 'WalletConnect',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRWu9CeO85RIMN2ixs9U_6YhnatWBxtCzn6L_e7QRO_CiEV1SB0LGbSXJijfHYt0N46slY&usqp=CAU',
    type: WalletType.EVM,
  },
];

export const STELLAR_WALLETS: WalletConfig[] = [
  {
    id: 'swiftex',
    name: 'SwiftEx Wallet',
    icon: '/logo.png',
    type: WalletType.STELLAR,
    wcListingId: 'a4604022bf9199ca6d762c5663d8a6186a9ca4b607b9dcb29bcb81054d6f1091',
    homepage: 'https://swiftexchange.io/',
  },
  {
    id: 'freighter',
    name: 'Freighter',
    icon: 'https://framerusercontent.com/images/hJLECaObEXnPQkYrO2ZccbSk.png?width=512&height=512',
    type: WalletType.STELLAR,
    wcListingId: '997a355c8f682468706a76cff1b004a7115f505fb962dac54b6e9b442dd1c380',
    homepage: 'https://www.freighter.app/',
    injectedIds: ['freighter', 'freighterApi'],
  },
  {
    id: 'lobstr',
    name: 'LOBSTR',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRr4vU2tmIUuPEaeD2fPRDIgbC4ZcqfNzQR3Q&s',
    type: WalletType.STELLAR,
    wcListingId: '76a3d548a08cf402f5c7d021f24fd2881d767084b387a5325df88bc3d4b6f21b',
    homepage: 'https://lobstr.co/',
    injectedIds: ['lobstr'],
  },
  {
    id: 'hotwallet',
    name: 'HOT Wallet',
    icon: 'https://play-lh.googleusercontent.com/bQ9_bN9gq2i6sB2zJ9zK0L1M2N3O4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D9E0F1G2H=s96',
    type: WalletType.STELLAR,
    rdns: 'org.hot-labs',
    wcListingId: 'aee5083aac025c4c3f1c9afc31ea89dbddca0b1c248195bef469fc4886ae3ab2',
    homepage: 'https://hot-labs.org/wallet',
    injectedIds: ['isHotWallet'],
  },
  {
    id: 'walletconnect',
    name: 'WalletConnect',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRWu9CeO85RIMN2ixs9U_6YhnatWBxtCzn6L_e7QRO_CiEV1SB0LGbSXJijfHYt0N46slY&usqp=CAU',
    type: WalletType.STELLAR,
  },
];

export const CHAIN_METHODS = {
  evm: [
    'eth_sendTransaction',
    'eth_signTransaction',
    'eth_sign',
    'personal_sign',
    'eth_signTypedData',
    'eth_signTypedData_v4',
  ],
  stellar: ['stellar_signTransaction', 'stellar_signAndSubmitXDR'],
};

export const CHAIN_EVENTS = {
  evm: ['chainChanged', 'accountsChanged'],
  stellar: ['accountsChanged'],
};

export interface WalletMetadata {
  name: string;
  icon: string;
  rdns?: string;
  homepage?: string;
  wcListingId?: string;
  injected?: Array<{ injected_id: string; namespace: string }>;
  redirects?: {
    native?: string;
    universal?: string;
  };
  desktop?: {
    native?: string | null;
    universal?: string | null;
  };
}

export const WALLET_METADATA_MAP: Record<string, WalletMetadata> = {
  swiftex: {
    name: 'SwiftEx Wallet',
    icon: 'https://explorer-api.walletconnect.com/v3/logo/sm/54c06c6a-333d-49d6-f2fd-7e89d2068500?projectId=fdde0f7f2696cc4d849103c23792d693',
    wcListingId: 'a4604022bf9199ca6d762c5663d8a6186a9ca4b607b9dcb29bcb81054d6f1091',
    homepage: 'https://swiftexchange.io/',
    redirects: {
      native: 'swiftEx://app.swiftexchange.io',
      universal: 'https://app.swiftexchange.io/',
    },
  },
  metamask: {
    name: 'MetaMask',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT3ymr3UNKopfI0NmUY95Dr-0589vG-91KuAA&s',
    rdns: 'io.metamask',
    wcListingId: 'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
    homepage: 'https://metamask.io/',
    injected: [{ injected_id: 'isMetaMask', namespace: 'eip155' }],
    redirects: {
      native: 'metamask://',
      universal: 'https://metamask.app.link',
    },
  },
  trust: {
    name: 'Trust Wallet',
    icon: 'https://play-lh.googleusercontent.com/cd5BevWohRqLwsI2_i3k4YIVtcO57cIZCs6l20H1Hcdj0P2rFEcX_7QtgKbTM3Sn_A',
    rdns: 'com.trustwallet.app',
    wcListingId: '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0',
    homepage: 'https://trustwallet.com/',
    injected: [
      { injected_id: 'isTrust', namespace: 'eip155' },
      { injected_id: 'isTrustWallet', namespace: 'eip155' },
    ],
    redirects: {
      native: 'trust://',
      universal: 'https://link.trustwallet.com',
    },
  },
  phantom: {
    name: 'Phantom',
    icon: 'https://explorer-api.walletconnect.com/v3/logo/sm/b6ec7b81-bb4f-427d-e290-7631e6e50d00?projectId=fdde0f7f2696cc4d849103c23792d693',
    rdns: 'app.phantom',
    wcListingId: 'a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393',
    homepage: 'https://phantom.app/',
    injected: [
      { injected_id: 'isPhantom', namespace: 'eip155' },
      { injected_id: 'isPhantom', namespace: 'solana' },
    ],
    redirects: {
      native: 'phantom://',
      universal: 'https://phantom.app',
    },
  },
  rainbow: {
    name: 'Rainbow',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRDU5aTw2FNop7OonFBOXEeAXb1biSQbBr6Ew&s',
    rdns: 'me.rainbow',
    homepage: 'https://rainbow.me/',
    redirects: {
      native: 'rainbow://',
      universal: 'https://rnbwapp.com/wc',
    },
  },
  lobstr: {
    name: 'LOBSTR Wallet',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRr4vU2tmIUuPEaeD2fPRDIgbC4ZcqfNzQR3Q&s',
    wcListingId: '76a3d548a08cf402f5c7d021f24fd2881d767084b387a5325df88bc3d4b6f21b',
    homepage: 'https://lobstr.co/',
    redirects: {
      native: 'lobstr://',
      universal: 'https://lobstr.co/uni/wc',
    },
    desktop: {
      universal: 'https://lobstr.co/',
    },
  },
  freighter: {
    name: 'Freighter',
    icon: 'https://framerusercontent.com/images/hJLECaObEXnPQkYrO2ZccbSk.png?width=512&height=512',
    wcListingId: '997a355c8f682468706a76cff1b004a7115f505fb962dac54b6e9b442dd1c380',
    homepage: 'https://www.freighter.app/',
    redirects: {
      native: 'freighterwallet://wc-redirect',
      universal: '',
    },
  },
  hotwallet: {
    name: 'HOT Wallet',
    icon: 'https://play-lh.googleusercontent.com/bQ9_bN9gq2i6sB2zJ9zK0L1M2N3O4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D9E0F1G2H=s96',
    rdns: 'org.hot-labs',
    wcListingId: 'aee5083aac025c4c3f1c9afc31ea89dbddca0b1c248195bef469fc4886ae3ab2',
    homepage: 'https://hot-labs.org/wallet',
    injected: [{ injected_id: 'isHotWallet', namespace: 'eip155' }],
    redirects: {
      native: 'hotwallet://',
      universal: 'https://app.hot-labs.org',
    },
    desktop: {
      universal: 'https://app.hot-labs.org/link',
    },
  },
  walletconnect: {
    name: 'WalletConnect',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRWu9CeO85RIMN2ixs9U_6YhnatWBxtCzn6L_e7QRO_CiEV1SB0LGbSXJijfHYt0N46slY&usqp=CAU',
  },
};
