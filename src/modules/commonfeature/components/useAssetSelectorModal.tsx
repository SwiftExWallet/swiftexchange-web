import { createContext, useContext } from 'react';

export type ActionType = 'SEND' | 'RECEIVE' | 'BRIDGE' | 'SWAP';

export interface AssetSelectorState {
  isOpen: boolean;
  actionType: ActionType;
  defaultNetwork: string | number | null;
  forceNetwork: string | number | null;
  pairedChainId: string | number | null;
  showAllStellarAssets: boolean;
  onSelect: ((asset: any) => void) | null;
}

export interface OpenOptions {
  onSelect?: (asset: any) => void;
  defaultNetwork?: string | number;
  forceNetwork?: string | number;
  pairedChainId?: string | number;
  showAllStellarAssets?: boolean;
}

export interface AssetSelectorDispatch {
  openAssetSelector: (type: ActionType, options?: OpenOptions) => void;
  closeAssetSelector: () => void;
}
export const stateContext = createContext<AssetSelectorState | undefined>(undefined);
export const dispatchContext = createContext<AssetSelectorDispatch | undefined>(undefined);

export type Action =
  { type: 'OPEN'; actionType: ActionType; options?: OpenOptions } | { type: 'CLOSE' };

export const initialAssetSelectorState: AssetSelectorState = {
  isOpen: false,
  actionType: 'SEND',
  defaultNetwork: null,
  forceNetwork: null,
  pairedChainId: null,
  showAllStellarAssets: false,
  onSelect: null,
};

export function assetSelectorReducer(
  state: AssetSelectorState,
  action: Action
): AssetSelectorState {
  switch (action.type) {
    case 'OPEN':
      return {
        isOpen: true,
        actionType: action.actionType,
        defaultNetwork: action.options?.defaultNetwork ?? null,
        forceNetwork: action.options?.forceNetwork ?? null,
        pairedChainId: action.options?.pairedChainId ?? null,
        showAllStellarAssets: !!action.options?.showAllStellarAssets,
        onSelect: action.options?.onSelect ?? null,
      };
    case 'CLOSE':
      return initialAssetSelectorState;
    default:
      return state;
  }
}

export function useAssetSelectorModal(): AssetSelectorState & AssetSelectorDispatch {
  const state = useContext(stateContext);
  const dispatch = useContext(dispatchContext);
  if (!state || !dispatch) {
    throw new Error('useAssetSelectorModal must be used within AssetSelectorProvider');
  }
  return { ...state, ...dispatch };
}

export function useAssetSelectorDispatch(): AssetSelectorDispatch {
  const dispatch = useContext(dispatchContext);
  if (!dispatch) {
    throw new Error('useAssetSelectorDispatch must be used within AssetSelectorProvider');
  }
  return dispatch;
}
