import type { Abi, Address } from 'viem'

export const CONTRACT_ADDRESS = '0x47be6b78dC569764d474515e177109Ba67D3c123' as Address

export const contractAbi = [
  { type: 'function', name: 'allowedToken', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'tokenDecimals', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'UNIT', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'getInvestmentsPaginated', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }, { name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }], outputs: [{ name: 'page', type: 'tuple[]', components: [{ name: 'amount', type: 'uint256' }, { name: 'cap', type: 'uint256' }, { name: 'earned', type: 'uint256' }, { name: 'otherEarned', type: 'uint256' }, { name: 'startedAt', type: 'uint64' }, { name: 'lastAccrued', type: 'uint64' }, { name: 'active', type: 'bool' }, { name: 'reinvest', type: 'bool' }] }] },
  { type: 'function', name: 'getPlanConfig', stateMutability: 'view', inputs: [], outputs: [{ name: 'multiplierBps', type: 'uint256[3]' }, { name: 'roiBps', type: 'uint256[3]' }, { name: 'minDirects', type: 'uint256[3]' }] },
  { type: 'function', name: 'getUserSummary', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ name: 's', type: 'tuple', components: [{ name: 'referrer', type: 'address' }, { name: 'joinedAt', type: 'uint64' }, { name: 'plan', type: 'uint8' }, { name: 'registered', type: 'bool' }, { name: 'blocked', type: 'bool' }, { name: 'directCount', type: 'uint256' }, { name: 'totalInvested', type: 'uint256' }, { name: 'activeInvested', type: 'uint256' }, { name: 'totalEarned', type: 'uint256' }, { name: 'capEarned', type: 'uint256' }, { name: 'withdrawable', type: 'uint256' }, { name: 'lastWithdraw', type: 'uint256' }, { name: 'nextWithdrawAt', type: 'uint256' }, { name: 'directEarned', type: 'uint256' }, { name: 'levelEarned', type: 'uint256' }, { name: 'totalWithdrawn', type: 'uint256' }, { name: 'totalReinvested', type: 'uint256' }, { name: 'totalReinvestFees', type: 'uint256' }, { name: 'lastWithdrawAmount', type: 'uint256' }, { name: 'lastReinvestAmount', type: 'uint256' }, { name: 'lastReinvestAt', type: 'uint256' }, { name: 'incomeCap', type: 'uint256' }, { name: 'remainingToEarn', type: 'uint256' }, { name: 'activeInvestments', type: 'uint256' }, { name: 'pendingRoi', type: 'uint256' }] }] },
  { type: 'function', name: 'maxInvest', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'minInvest', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'PLAN_2X', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'PLAN_3X', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'PLAN_25X', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'registrationFee', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'register', stateMutability: 'nonpayable', inputs: [{ name: 'referrer', type: 'address' }, { name: 'plan', type: 'uint8' }, { name: 'payToken', type: 'address' }], outputs: [] },
  { type: 'function', name: 'invest', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }, { name: 'payToken', type: 'address' }], outputs: [] },
  { type: 'function', name: 'withdraw', stateMutability: 'nonpayable', inputs: [{ name: 'payToken', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'reinvest', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'upgradePlan', stateMutability: 'nonpayable', inputs: [{ name: 'plan', type: 'uint8' }], outputs: [] },
] as const satisfies Abi

export const erc20Abi = [
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
] as const satisfies Abi
