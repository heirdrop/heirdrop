import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celoSepolia } from "viem/chains";
import heirlockAbi from "./heirlock-abi.json";
import { HEIRLOCK_CONTRACT_ADDRESS, getHeirlockClient } from "./heirlock-contract";
import { env } from "./env";

const defaultRpcUrl = celoSepolia.rpcUrls.default.http[0];

type WriteConfig = {
  functionName: "checkIn" | "claimWithIdentity";
  args: readonly unknown[];
};

let walletClient: ReturnType<typeof createWalletClient> | null = null;
let relayerAccount: ReturnType<typeof privateKeyToAccount> | null = null;

function assertRelayerConfig() {
  if (!env.HEIRLOCK_RELAYER_PRIVATE_KEY) {
    throw new Error("HEIRLOCK_RELAYER_PRIVATE_KEY is not set");
  }
}

function getRelayerAccount() {
  assertRelayerConfig();
  if (!relayerAccount) {
    relayerAccount = privateKeyToAccount(env.HEIRLOCK_RELAYER_PRIVATE_KEY as Hex);
  }
  return relayerAccount;
}

export function getRelayerWalletClient() {
  assertRelayerConfig();
  if (!walletClient) {
    walletClient = createWalletClient({
      account: getRelayerAccount(),
      chain: celoSepolia,
      transport: http(env.CELO_RPC_URL || defaultRpcUrl),
    });
  }
  return walletClient;
}

export async function writeWithRelayer({ functionName, args }: WriteConfig) {
  const account = getRelayerAccount();
  const client = getRelayerWalletClient();
  const hash = await client.writeContract({
    account,
    address: HEIRLOCK_CONTRACT_ADDRESS,
    abi: heirlockAbi,
    functionName,
    args,
  });

  const publicClient = getHeirlockClient(env.CELO_RPC_URL || defaultRpcUrl);
  await publicClient.waitForTransactionReceipt({ hash });
  return { hash, account };
}

export function getRelayerAddress() {
  return getRelayerAccount().address;
}
