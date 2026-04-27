const SESSION_KEY = 'sovereign:lit:authsig';
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;

const safeParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getCachedSession = () => {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  const payload = safeParse(raw);
  if (!payload) return null;

  if (Date.now() > payload.expiresAt) {
    window.sessionStorage.removeItem(SESSION_KEY);
    return null;
  }

  return payload;
};

const setCachedSession = (payload) => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
};

const resolveWalletAddress = async (provider) => {
  const accounts = await provider.request({ method: 'eth_accounts' });
  if (accounts?.[0]) {
    return accounts[0];
  }

  const requested = await provider.request({ method: 'eth_requestAccounts' });
  if (!requested?.[0]) {
    throw new Error('No wallet account found.');
  }

  return requested[0];
};

export const clearCachedAuthSig = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(SESSION_KEY);
};

export const getSessionAuthSig = async (provider) => {
  const walletAddress = await resolveWalletAddress(provider);
  const chainId = await provider.request({ method: 'eth_chainId' });
  const cached = getCachedSession();

  if (
    cached &&
    cached.address?.toLowerCase() === walletAddress.toLowerCase() &&
    cached.chainId === chainId
  ) {
    return {
      authSig: {
        sig: cached.sig,
        derivedVia: 'web3.eth.personal.sign',
        signedMessage: cached.signedMessage,
        address: cached.address
      },
      walletAddress,
      chainId,
      fromCache: true
    };
  }

  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const signedMessage = [
    'Unlock Sovereign Library Session',
    `Origin: ${window.location.origin}`,
    `Chain: ${chainId}`,
    `Expires: ${new Date(expiresAt).toISOString()}`
  ].join('\n');

  const sig = await provider.request({
    method: 'personal_sign',
    params: [signedMessage, walletAddress]
  });

  setCachedSession({
    sig,
    signedMessage,
    address: walletAddress,
    chainId,
    expiresAt
  });

  return {
    authSig: {
      sig,
      derivedVia: 'web3.eth.personal.sign',
      signedMessage,
      address: walletAddress
    },
    walletAddress,
    chainId,
    fromCache: false
  };
};
