import { createPublicClient, http, type Address, type Hash } from "viem";
import { celoAlfajores } from "viem/chains";
import heirlockAbi from "./heirlock-abi.json";
import { env } from "./env";

export const HEIRLOCK_CONTRACT_ADDRESS = (env.NEXT_PUBLIC_HEIRLOCK_CONTRACT_ADDRESS || "0xdeaD5EE9Ea38d2aC5802FF9D76335DB3Eda0DEad") as Address;

export type HeirlockABI = typeof heirlockAbi;

export function getHeirlockClient(rpcUrl?: string) {
  const url = rpcUrl || env.CELO_RPC_URL || "https://alfajores-forno.celo-testnet.org";
  return createPublicClient({
    chain: celoAlfajores,
    transport: http(url),
  });
}

export async function generateIdentityHash(
  firstName: string,
  lastName: string,
  dateOfBirth: string,
  rpcUrl?: string
): Promise<Hash> {
  const client = getHeirlockClient(rpcUrl);
  
  const result = await client.readContract({
    address: HEIRLOCK_CONTRACT_ADDRESS,
    abi: heirlockAbi as HeirlockABI,
    functionName: "generateIdentityHash",
    args: [
      {
        firstName,
        lastName,
        dateOfBirth,
      },
    ],
  });
  
  return result as Hash;
}

export async function getIdentityInfo(
  owner: Address,
  identityHash: Hash,
  rpcUrl?: string
) {
  const client = getHeirlockClient(rpcUrl);
  
  return await client.readContract({
    address: HEIRLOCK_CONTRACT_ADDRESS,
    abi: heirlockAbi as HeirlockABI,
    functionName: "getIdentityInfo",
    args: [owner, identityHash],
  });
}

export async function getIdentityWillAssets(
  owner: Address,
  identityHash: Hash,
  rpcUrl?: string
) {
  const client = getHeirlockClient(rpcUrl);
  
  return await client.readContract({
    address: HEIRLOCK_CONTRACT_ADDRESS,
    abi: heirlockAbi as HeirlockABI,
    functionName: "getIdentityWillAssets",
    args: [owner, identityHash],
  });
}

export async function hasIdentityClaimed(
  owner: Address,
  identityHash: Hash,
  rpcUrl?: string
): Promise<boolean> {
  const client = getHeirlockClient(rpcUrl);
  
  return await client.readContract({
    address: HEIRLOCK_CONTRACT_ADDRESS,
    abi: heirlockAbi as HeirlockABI,
    functionName: "hasIdentityClaimed",
    args: [owner, identityHash],
  }) as boolean;
}

export async function isOwnerAlive(
  owner: Address,
  rpcUrl?: string
): Promise<boolean> {
  const client = getHeirlockClient(rpcUrl);
  
  return await client.readContract({
    address: HEIRLOCK_CONTRACT_ADDRESS,
    abi: heirlockAbi as HeirlockABI,
    functionName: "isOwnerAlive",
    args: [owner],
  }) as boolean;
}

export async function getOwnerLiveliness(
  owner: Address,
  rpcUrl?: string
) {
  const client = getHeirlockClient(rpcUrl);
  
  return await client.readContract({
    address: HEIRLOCK_CONTRACT_ADDRESS,
    abi: heirlockAbi as HeirlockABI,
    functionName: "getOwnerLiveliness",
    args: [owner],
  });
}

export async function getIdentityBeneficiaries(
  owner: Address,
  rpcUrl?: string
): Promise<`0x${string}`[]> {
  const client = getHeirlockClient(rpcUrl);
  
  return await client.readContract({
    address: HEIRLOCK_CONTRACT_ADDRESS,
    abi: heirlockAbi as HeirlockABI,
    functionName: "getIdentityBeneficiaries",
    args: [owner],
  }) as `0x${string}`[];
}

