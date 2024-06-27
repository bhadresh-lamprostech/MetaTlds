const fs = require('fs');
const path = require('path');
const { MerkleTree } = require('merkletreejs');
const SHA256 = require('crypto-js/sha256');

// Read the TLDs from the JSON file
const tldsFilePath = path.join(__dirname, './tlds.json');
const tlds = JSON.parse(fs.readFileSync(tldsFilePath, 'utf8'));

// Create the Merkle tree
const leaves = tlds.map(tld => Buffer.from(SHA256(tld).toString(), 'hex'));
const merkleTree = new MerkleTree(leaves, SHA256);
const root = merkleTree.getRoot().toString('hex');

// Function to generate proof for a given TLD
function generateProof(tld) {
  const leaf = Buffer.from(SHA256(tld).toString(), 'hex');
  const proof = merkleTree.getProof(leaf).map(x => x.data.toString('hex'));
  return proof;
}

// Function to verify proof for a given TLD
function verifyProof(tld, proof, root) {
  const leaf = Buffer.from(SHA256(tld).toString(), 'hex');
  const verified = merkleTree.verify(proof.map(x => Buffer.from(x, 'hex')), leaf, Buffer.from(root, 'hex'));
  return verified;
}

// Save the Merkle root to a file
fs.writeFileSync(path.join(__dirname, 'merkleRoot.json'), JSON.stringify({ root }), 'utf8');

// Export root and generateProof
module.exports = { root, generateProof, verifyProof };

// // Test a TLD
// const testTld = ;
// const proof = generateProof(testTld);

// console.log('Generated Proof:', proof);
// console.log('Merkle Root:', root);

// // Verify the proof
// const isValid = verifyProof(testTld, proof, root);

// if (isValid) {
//   console.log(`The proof for TLD "${testTld}" is valid.`);
// } else {
//   console.log(`The proof for TLD "${testTld}" is invalid.`);
// }
