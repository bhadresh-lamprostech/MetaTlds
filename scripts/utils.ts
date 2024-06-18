import { ethers } from "hardhat";
import { toBigInt } from "web3-utils";

export function calIdentifier(chainId: number, owner: string, tld: string): bigint {
  const hash = ethers.solidityPackedKeccak256(
    ["address", "string"],
    [owner, tld]
  );
  return (
    (toBigInt(chainId) << toBigInt(224)) + (toBigInt(hash) >> toBigInt(32))
  );
}

export function getInitializerData(
  contractInterface: Interface,
  args: unknown[],
  initializer: string | false = "initialize"
): string {
  if (initializer === false) {
    return "0x";
  }

  const fragment = contractInterface.getFunction(initializer);
  if (!fragment) {
    return "0x";
  }

  return contractInterface.encodeFunctionData(fragment, args);
}
