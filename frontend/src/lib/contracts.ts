export const MEGALOCK_ADDRESS = "0x0bEe5fF06bB5CF531f7bc3bbBBD76089838095F7" as const;
export const MEGABURN_ADDRESS = "0x3D05fC9f25D90745b18c5723CBbDCEC33E821DAB" as const;

export const MEGALOCK_ABI = [
  {
    type: "function",
    name: "createTimeLock",
    inputs: [
      { name: "token", type: "address" },
      { name: "beneficiary", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "unlockTime", type: "uint64" },
      { name: "cancelable", type: "bool" },
    ],
    outputs: [{ name: "lockId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createLinearVesting",
    inputs: [
      { name: "token", type: "address" },
      { name: "beneficiary", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "startTime", type: "uint64" },
      { name: "cliffTime", type: "uint64" },
      { name: "endTime", type: "uint64" },
      { name: "cancelable", type: "bool" },
    ],
    outputs: [{ name: "lockId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createSteppedVesting",
    inputs: [
      { name: "token", type: "address" },
      { name: "beneficiary", type: "address" },
      { name: "amount", type: "uint256" },
      {
        name: "_milestones",
        type: "tuple[]",
        components: [
          { name: "timestamp", type: "uint64" },
          { name: "basisPoints", type: "uint256" },
        ],
      },
      { name: "cancelable", type: "bool" },
    ],
    outputs: [{ name: "lockId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claim",
    inputs: [{ name: "lockId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "cancel",
    inputs: [{ name: "lockId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getLock",
    inputs: [{ name: "lockId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "token", type: "address" },
          { name: "creator", type: "address" },
          { name: "beneficiary", type: "address" },
          { name: "totalAmount", type: "uint256" },
          { name: "claimedAmount", type: "uint256" },
          { name: "lockType", type: "uint8" },
          { name: "startTime", type: "uint64" },
          { name: "cliffTime", type: "uint64" },
          { name: "endTime", type: "uint64" },
          { name: "cancelable", type: "bool" },
          { name: "cancelled", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMilestones",
    inputs: [{ name: "lockId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "timestamp", type: "uint64" },
          { name: "basisPoints", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVestedAmount",
    inputs: [{ name: "lockId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getClaimableAmount",
    inputs: [{ name: "lockId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getLocksByCreator",
    inputs: [{ name: "creator", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getLocksByBeneficiary",
    inputs: [{ name: "beneficiary", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nextLockId",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "LockCreated",
    inputs: [
      { name: "lockId", type: "uint256", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "beneficiary", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "lockType", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TokensClaimed",
    inputs: [
      { name: "lockId", type: "uint256", indexed: true },
      { name: "beneficiary", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LockCancelled",
    inputs: [
      { name: "lockId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "returnedAmount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const MEGABURN_ABI = [
  {
    type: "function",
    name: "burn",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "batchBurn",
    inputs: [
      { name: "tokens", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "totalBurned",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "amount", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "userBurned",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "amount", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "TokensBurned",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "burner", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
