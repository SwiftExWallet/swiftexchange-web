import { type FC, type ReactNode, useMemo, useReducer } from 'react';

import {
  type ActionType,
  type AssetSelectorDispatch,
  type OpenOptions,
  assetSelectorReducer,
  dispatchContext,
  initialAssetSelectorState,
  stateContext,
} from './useAssetSelectorModal';

export const AssetSelectorProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(assetSelectorReducer, initialAssetSelectorState);
  const actions = useMemo<AssetSelectorDispatch>(
    () => ({
      openAssetSelector: (type: ActionType, options?: OpenOptions) =>
        dispatch({ type: 'OPEN', actionType: type, options }),
      closeAssetSelector: () => dispatch({ type: 'CLOSE' }),
    }),
    []
  );

  return (
    <dispatchContext.Provider value={actions}>
      <stateContext.Provider value={state}>{children}</stateContext.Provider>
    </dispatchContext.Provider>
  );
};
export default AssetSelectorProvider;
