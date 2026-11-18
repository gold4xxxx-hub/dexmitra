# Admin User Hold/Block Facility

**Status**: ✅ Already Implemented

The admin can hold/pause users to prevent them from making payouts or transactions. This is a smart contract feature that blocks individual users from interacting with the system.

## Overview

The DexMitra contract includes user-level blocking functionality that allows the contract owner to:
- **Block individual users** — Prevent a single user from making investments, withdrawals, or other transactions
- **Unblock individual users** — Restore a blocked user's access
- **Batch block users** — Block or unblock multiple users at once
- **Monitor user status** — See if a user is blocked in their account summary

## How It Works

### Smart Contract Functions

The contract implements two functions for user blocking:

#### 1. Single User Block: `setBlocked(address user, bool blocked)`
- **Purpose**: Block or unblock a single user
- **Parameters**:
  - `user` — The wallet address to block/unblock
  - `blocked` — `true` to block, `false` to unblock
- **Access**: Owner only
- **Effect**: Immediately prevents the user from:
  - Making new investments
  - Withdrawing earnings
  - Reinvesting
  - Receiving payouts

#### 2. Batch User Block: `setBlockedBatch(address[] users, bool blocked)`
- **Purpose**: Block or unblock multiple users in one transaction
- **Parameters**:
  - `users` — Array of wallet addresses (comma-separated)
  - `blocked` — `true` to block, `false` to unblock
- **Access**: Owner only
- **Cost**: Single transaction for any number of users
- **Effect**: Same as above, but affects all listed users

### User Status Check

Users can see if they are blocked via their account summary:

```solidity
struct UserSummary {
    // ... other fields ...
    bool blocked;  // true if user is blocked
    // ... other fields ...
}
```

If `blocked = true`:
- User cannot make deposits/investments
- User cannot withdraw earnings
- User cannot reinvest
- User can still view their account data

## Admin UI - Single User Block

**Location**: Dashboard → Contract Administration → User Access

### Form Fields
- **User address** — Enter the wallet address to block/unblock
- **New status** — Dropdown:
  - "Block user" (true)
  - "Unblock user" (false)
- **Button**: "Update user access"

### Example
```
User address: 0x1234567890123456789012345678901234567890
New status:   Block user
```

After submission:
1. ✅ Transaction submitted to blockchain
2. ✅ User's `blocked` status changes to `true`
3. ✅ User immediately cannot perform transactions
4. ✅ User can still see their account (read-only)

## Admin UI - Batch User Block

**Location**: Dashboard → Contract Administration → Batch User Access

### Form Fields
- **Addresses (comma-separated)** — List of wallet addresses, one per line or separated by commas
- **New status** — Dropdown:
  - "Block users" (true)
  - "Unblock users" (false)
- **Button**: "Update user access batch"

### Example
```
Addresses:
0x1111111111111111111111111111111111111111,
0x2222222222222222222222222222222222222222,
0x3333333333333333333333333333333333333333

New status: Block users
```

After submission:
1. ✅ Single transaction blocks all 3 users
2. ✅ All users immediately blocked
3. ✅ Much more efficient than 3 separate transactions

## Blocked User Experience

When a user is blocked:

### On Login
- User can still connect their wallet
- Dashboard shows their account information
- **Status indicator**: "User Access: Blocked"
- Red alert displayed: "Your account is blocked. Contact support."

### When Attempting Transactions
- **Investment form**: Disabled with message "Cannot invest: Account is blocked"
- **Withdrawal button**: Disabled with message "Cannot withdraw: Account is blocked"
- **Reinvestment form**: Disabled with message "Cannot reinvest: Account is blocked"
- **Plan upgrade**: Cannot upgrade to new plans

## Use Cases

### Regulatory Compliance
- Block users in compliance hold during investigations
- Unblock when investigation completes

### Fraud Prevention
- Quickly block accounts suspected of fraud
- Freeze their funds until review

### Account Suspension
- Hold user accounts during KYC recheck
- Suspend for Terms of Service violation

### Payout Pause
- Block users temporarily to pause payout processing
- Useful when liquidity is low
- Unblock when reserves replenish

### Emergency Response
- Immediately block accounts during security incidents
- Prevents fund theft or unauthorized access

## Admin Responsibilities

⚠️ **Important**:
- Blocking a user is **immediate and irreversible** until unblocked
- Users cannot withdraw earnings while blocked
- Users will receive no payouts while blocked
- Document the reason for blocking (off-chain)
- Monitor blocked users regularly
- Have a process to unblock legitimate users

## Smart Contract Status Field

The `blocked` status is part of `getUserSummary()`:

```typescript
// Example response
{
  user: "0x1234...",
  blocked: true,  // ← User is blocked
  totalInvested: 1000n,
  activeInvested: 500n,
  withdrawable: 100n,
  // ... other fields
}
```

Frontend checks this field to:
- Show blocked status in dashboard
- Disable transaction buttons
- Display warning messages

## Comparison: Contract Pause vs. User Block

| Feature | Contract Pause | User Block |
|---------|---|---|
| **Scope** | All users | Single or batch |
| **Used for** | Emergency shutdown | Individual suspension |
| **Withdrawal allowed** | ❌ No | ❌ No |
| **Reversal speed** | Instant | Instant |
| **User can see account** | ✅ Yes | ✅ Yes |
| **Function name** | `pause()` / `unpause()` | `setBlocked()` / `setBlockedBatch()` |
| **UI location** | Contract availability section | User access section |

## Code References

### Smart Contract ABI
```typescript
// From contract.ts
{ type: 'function', name: 'setBlocked', 
  stateMutability: 'nonpayable', 
  inputs: [
    { name: 'user', type: 'address' }, 
    { name: 'blocked', type: 'bool' }
  ], 
  outputs: [] 
},
{ type: 'function', name: 'setBlockedBatch', 
  stateMutability: 'nonpayable', 
  inputs: [
    { name: 'users', type: 'address[]' }, 
    { name: 'blocked', type: 'bool' }
  ], 
  outputs: [] 
}
```

### User Summary Status
```typescript
// From contract.ts
{ type: 'function', name: 'getUserSummary', 
  stateMutability: 'view', 
  inputs: [{ name: 'user', type: 'address' }], 
  outputs: [{ 
    name: 's', type: 'tuple', 
    components: [
      // ... other fields ...
      { name: 'blocked', type: 'bool' },  // ← Status field
      // ... other fields ...
    ]
  }]
}
```

### Admin UI Implementation
**File**: `src/App.tsx`

**Single block form** (lines ~930-950):
```tsx
<form onSubmit={(event) => void submitAdminAction(event, async (client) => {
  if (!isAddress(adminUserAddress)) throw new Error('Enter a valid user address.')
  return client.writeContract({
    address: CONTRACT_ADDRESS,
    abi: contractAbi,
    functionName: 'setBlocked',
    args: [getAddress(adminUserAddress), adminUserBlocked === 'true'],
  })
})}>
  <h3>User access</h3>
  <label className="field-label" htmlFor="admin-user-address">User address</label>
  <input id="admin-user-address" value={adminUserAddress} 
    onChange={(event) => setAdminUserAddress(event.target.value.trim())} 
    placeholder="0x…" spellCheck={false} required />
  <label className="field-label" htmlFor="admin-user-status">New status</label>
  <select id="admin-user-status" value={adminUserBlocked} 
    onChange={(event) => setAdminUserBlocked(event.target.value)}>
    <option value="true">Block user</option>
    <option value="false">Unblock user</option>
  </select>
  <button className="submit-button" type="submit" disabled={adminBusy}>
    Update user access
  </button>
</form>
```

**Batch block form** (lines ~1095-1115):
```tsx
<form onSubmit={(event) => void submitAdminAction(event, async (client, values) => {
  const addresses = adminField(values, 'User addresses (comma-separated)')
    .split(',').map((value) => value.trim())
  if (addresses.length === 0 || addresses.some((address) => !isAddress(address))) 
    throw new Error('Enter valid comma-separated user addresses.')
  return client.writeContract({
    address: CONTRACT_ADDRESS,
    abi: contractAbi,
    functionName: 'setBlockedBatch',
    args: [addresses.map(getAddress), values['New status'] === 'true'],
  })
})}>
  <h3>Batch user access</h3>
  <label className="field-label" htmlFor="admin-batch-users">
    Addresses (comma-separated)
  </label>
  <textarea id="admin-batch-users" name="User addresses (comma-separated)" 
    rows={3} placeholder="0x…, 0x…" required />
  <label className="field-label" htmlFor="admin-batch-status">New status</label>
  <select id="admin-batch-status" name="New status" defaultValue="true">
    <option value="true">Block users</option>
    <option value="false">Unblock users</option>
  </select>
  <button className="submit-button" type="submit" disabled={adminBusy}>
    Update user access batch
  </button>
</form>
```

## Security Considerations

✅ **Owner-only access** — Only contract owner can block/unblock users
✅ **On-chain enforcement** — Smart contract prevents transactions from blocked users
✅ **Immediate effect** — Changes take effect in next block
✅ **Audit trail** — All blocks logged on blockchain
✅ **Reversible** — Can unblock users anytime
✅ **No data loss** — Blocked users keep their account data

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Invalid address" error | Check wallet address format; must be valid Ethereum address |
| Batch block fails | Ensure all addresses are valid; check comma separation |
| User still can transact | Wait for block confirmation; refresh page after ~10-20 seconds |
| Cannot find user address | Make sure user has registered on the platform |
| Need to block many users | Use batch block function instead of single blocks |
| User disputes block | Review reason for block; unblock if needed with same process |

## Summary

The user hold/block facility is **fully implemented and ready to use**:

✅ Single user blocking via UI
✅ Batch user blocking via UI
✅ Smart contract enforcement
✅ Immediate effect
✅ User status visibility
✅ Admin-only access
✅ Reversible (can unblock anytime)

No additional development needed — this is a core contract feature already deployed on mainnet.
