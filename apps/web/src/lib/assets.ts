export type AssetHolding = {
  id: string;
  chain: string;
  chainId?: number;
  layerZeroChainId?: number;
  symbol: string;
  balance: number;
  fiatValue: number;
  address?: `0x${string}`;
  category: "native" | "erc20";
  decimals?: number;
  remote?: boolean;
  allowance?: bigint;
  hasAllowance?: boolean;
};

export type TokenCandidate = {
  id: string;
  symbol: string;
  address: `0x${string}`;
  decimals?: number;
  category: AssetHolding["category"];
  chain?: string;
  chainId?: number;
  layerZeroChainId?: number;
};

export const CELO_NATIVE_ADDRESS = "0x471EcE3750Da237f93B8E339c536989b8978a438";

export const celoSepoliaTokenCandidates: TokenCandidate[] = [
  {
    id: "cusd",
    symbol: "cUSD",
    address: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1",
    decimals: 18,
    category: "erc20",
  },
  {
    id: "ceur",
    symbol: "cEUR",
    address: "0x10c892A6EbcD37B8b6cA16b89cD63F9136a2B7b7",
    decimals: 18,
    category: "erc20",
  },
  {
    id: "creal",
    symbol: "cREAL",
    address: "0xE4D517785D091D3c54818832DB6094bcc2744545",
    decimals: 18,
    category: "erc20",
  },
];

export const remoteChainTemplates: Array<
  TokenCandidate & { chain: string; layerZeroChainId: number; chainId: number }
> = [
  {
    id: "eth-usdc",
    chain: "Ethereum",
    chainId: 1,
    layerZeroChainId: 101,
    symbol: "USDC",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
    category: "erc20",
  },
  {
    id: "arb-usdc",
    chain: "Arbitrum",
    chainId: 42161,
    layerZeroChainId: 110,
    symbol: "USDC.e",
    address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimals: 6,
    category: "erc20",
  },
  {
    id: "base-usdc",
    chain: "Base",
    chainId: 8453,
    layerZeroChainId: 184,
    symbol: "USDC",
    address: "0x833589fCd6eDb6AadA95d5baae5C60a71B7B2aFd",
    decimals: 6,
    category: "erc20",
  },
];

export function generateRemoteHoldings(owner?: string | null): AssetHolding[] {
  if (!owner) return [];
  const seed = owner.length > 2 ? owner.charCodeAt(2) % 5 : 1;
  return remoteChainTemplates.map((template, index) => {
    const modifier = (seed + index + 1) * 250;
    const balance = (modifier / 1000) * 10;
    return {
      id: `${template.id}-${index}`,
      chain: template.chain,
      chainId: template.chainId,
      layerZeroChainId: template.layerZeroChainId,
      symbol: template.symbol,
      balance,
      fiatValue: balance,
      category: template.category,
      address: template.address,
      remote: true,
    };
  });
}
