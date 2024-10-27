import { describe, test, expect, beforeEach } from 'vitest';
import { Client, Provider, ProviderRegistry, Result } from "@blockstack/clarity";
import { principalCV, bufferCV, uintCV, stringAsciiCV } from "@stacks/transactions";

describe('Content Curation DAO Contract Test Suite', () => {
  let client: Client;
  let provider: Provider;
  
  // Test accounts
  const deployer = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
  const user1 = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG";
  const user2 = "ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC";
  const user3 = "ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND";
  
  beforeEach(async () => {
    provider = await ProviderRegistry.createProvider();
    client = new Client(`${deployer}.content-curation-dao`, "content-curation-dao", provider);
    await client.deployContract();
  });
  
  describe('Content Submission', () => {
    test('should allow user to submit content with sufficient stake', async () => {
      // Simulate STX transfer to user1
      await provider.mineBlock([
        client.createTransaction({
          method: {
            name: "transfer-stx",
            args: [uintCV(1000), principalCV(user1)]
          }
        })
      ]);
      
      const contentHash = bufferCV(Buffer.from("test-content-hash"));
      const receipt = await client.submitContent(contentHash, {
        sender: user1
      });
      
      expect(receipt.success).toBe(true);
      const contentId = receipt.value;
      expect(contentId).toBe(1);
      
      // Verify content details
      const content = await client.getContent(uintCV(1));
      expect(content.author).toBe(user1);
      expect(content.upvotes).toBe(0);
      expect(content.downvotes).toBe(0);
      expect(content.status).toBe("active");
    });
    
    test('should reject content submission without sufficient stake', async () => {
      const contentHash = bufferCV(Buffer.from("test-content-hash"));
      const receipt = await client.submitContent(contentHash, {
        sender: user2
      });
      
      expect(receipt.success).toBe(false);
      expect(receipt.error).toBe(103); // ERR-INSUFFICIENT-STAKE
    });
  });
  
  describe('Voting System', () => {
    beforeEach(async () => {
      // Setup: Submit content first
      await provider.mineBlock([
        client.createTransaction({
          method: {
            name: "transfer-stx",
            args: [uintCV(1000), principalCV(user1)]
          }
        })
      ]);
      
      const contentHash = bufferCV(Buffer.from("test-content-hash"));
      await client.submitContent(contentHash, {
        sender: user1
      });
    });
    
    test('should allow users to upvote content', async () => {
      const receipt = await client.voteOnContent(
          uintCV(1),
          stringAsciiCV("upvote"),
          { sender: user2 }
      );
      
      expect(receipt.success).toBe(true);
      
      // Verify vote was recorded
      const content = await client.getContent(uintCV(1));
      expect(content.upvotes).toBe(1);
      
      // Verify curator stats
      const curatorStats = await client.getCuratorStats(principalCV(user2));
      expect(curatorStats.total_votes).toBe(1);
      expect(curatorStats.reputation).toBe(1);
    });
    
    test('should prevent double voting', async () => {
      // First vote
      await client.voteOnContent(
          uintCV(1),
          stringAsciiCV("upvote"),
          { sender: user2 }
      );
      
      // Second vote attempt
      const receipt = await client.voteOnContent(
          uintCV(1),
          stringAsciiCV("upvote"),
          { sender: user2 }
      );
      
      expect(receipt.success).toBe(false);
      expect(receipt.error).toBe(102); // ERR-ALREADY-VOTED
    });
    
    test('should allow downvoting', async () => {
      const receipt = await client.voteOnContent(
          uintCV(1),
          stringAsciiCV("downvote"),
          { sender: user2 }
      );
      
      expect(receipt.success).toBe(true);
      
      const content = await client.getContent(uintCV(1));
      expect(content.downvotes).toBe(1);
    });
  });
  
  describe('Reward Distribution', () => {
    beforeEach(async () => {
      // Setup: Submit content and add votes
      await provider.mineBlock([
        client.createTransaction({
          method: {
            name: "transfer-stx",
            args: [uintCV(1000), principalCV(user1)]
          }
        })
      ]);
      
      const contentHash = bufferCV(Buffer.from("test-content-hash"));
      await client.submitContent(contentHash, {
        sender: user1
      });
      
      await client.voteOnContent(
          uintCV(1),
          stringAsciiCV("upvote"),
          { sender: user2 }
      );
    });
    
    test('should distribute rewards correctly', async () => {
      const initialAuthorBalance = await provider.getBalance(user1);
      
      const receipt = await client.distributeRewards(uintCV(1));
      expect(receipt.success).toBe(true);
      
      // Verify rewards distribution
      const finalAuthorBalance = await provider.getBalance(user1);
      expect(finalAuthorBalance - initialAuthorBalance).toBe(60); // 60% of stake
      
      // Verify content status update
      const content = await client.getContent(uintCV(1));
      expect(content.status).toBe("rewarded");
    });
    
    test('should not distribute rewards for content without votes', async () => {
      // Submit new content without votes
      const contentHash = bufferCV(Buffer.from("test-content-hash-2"));
      await client.submitContent(contentHash, {
        sender: user1
      });
      
      const receipt = await client.distributeRewards(uintCV(2));
      expect(receipt.success).toBe(false);
      expect(receipt.error).toBe(101); // ERR-INVALID-CONTENT
    });
  });
  
  describe('Governance', () => {
    test('should allow owner to update minimum stake', async () => {
      const receipt = await client.setMinStake(
          uintCV(200),
          { sender: deployer }
      );
      
      expect(receipt.success).toBe(true);
      
      // Verify updated stake amount
      const minStake = await client.getMinStake();
      expect(minStake).toBe(200);
    });
    
    test('should prevent non-owner from updating minimum stake', async () => {
      const receipt = await client.setMinStake(
          uintCV(200),
          { sender: user1 }
      );
      
      expect(receipt.success).toBe(false);
      expect(receipt.error).toBe(100); // ERR-NOT-AUTHORIZED
    });
  });
  
  describe('Edge Cases', () => {
    test('should handle non-existent content gracefully', async () => {
      const receipt = await client.voteOnContent(
          uintCV(999),
          stringAsciiCV("upvote"),
          { sender: user2 }
      );
      
      expect(receipt.success).toBe(false);
      expect(receipt.error).toBe(104); // ERR-CONTENT-NOT-FOUND
    });
    
    test('should maintain correct vote counts under heavy voting', async () => {
      // Submit content
      const contentHash = bufferCV(Buffer.from("test-content-hash"));
      await client.submitContent(contentHash, {
        sender: user1
      });
      
      // Multiple users voting
      const voters = [user2, user3];
      for (const voter of voters) {
        await client.voteOnContent(
            uintCV(1),
            stringAsciiCV("upvote"),
            { sender: voter }
        );
      }
      
      const content = await client.getContent(uintCV(1));
      expect(content.upvotes).toBe(voters.length);
    });
  });
  
  // Helper function to check balances
  async function getBalance(address: string): Promise<number> {
    return provider.getBalance(address);
  }
});
