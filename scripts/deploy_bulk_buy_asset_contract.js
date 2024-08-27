const { ethers, upgrades } = require("hardhat");

async function main() {
  const BulkBuyAsset = await ethers.getContractFactory("BulkBuyAsset");

  console.log("Deploying BulkBuyAsset...");

  const bulkBuyAsset = await BulkBuyAsset.deploy();

  await bulkBuyAsset.deployed();

  console.log("BulkBuyAsset deployed to:", bulkBuyAsset.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
