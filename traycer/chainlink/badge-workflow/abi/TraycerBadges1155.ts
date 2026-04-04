export const TraycerBadges1155ABI = [
  {
    type: "function",
    name: "onReport",
    inputs: [
      { name: "metadata", type: "bytes" },
      { name: "report", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "redeemBadge",
    inputs: [{ name: "badgeId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "BadgeMinted",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "badgeId", type: "uint256", indexed: true },
      { name: "totalReturns", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BadgeRedeemed",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "badgeId", type: "uint256", indexed: true },
    ],
    anonymous: false,
  },
] as const;
