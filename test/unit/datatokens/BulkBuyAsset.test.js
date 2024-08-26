const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { expectRevert, BN } = require("@openzeppelin/test-helpers");
const { getEventFromTx } = require("../../helpers/utils");
const constants = require("../../helpers/constants");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

async function signMessage(message, signer) {
  const signedMessage = await signer.signMessage(ethers.utils.arrayify(message));
  const { v, r, s } = ethers.utils.splitSignature(signedMessage);
  return { v, r, s };
}

describe("BulkBuyAsset", function () {
  let owner, user3, user5, user6, opcCollector, publishMarketFeeAddress, mockErc20, mockErc20Decimals, fixedRateExchange, tokenERC721, factoryERC721, templateERC20, erc20Address, erc20Token, bulkBuyAsset;

  const cap = web3.utils.toWei("100000");
  const publishMarketFeeAmount = "0";
  const addressZero = ZERO_ADDRESS;

  beforeEach("init contracts for each test", async () => {
    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20TemplateEnterprise");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");

    const Router = await ethers.getContractFactory("FactoryRouter");
    const FixedRateExchange = await ethers.getContractFactory(
      "FixedRateExchange"
    );
    const Dispenser = await ethers.getContractFactory(
      "Dispenser"
    );

    const MockErc20 = await ethers.getContractFactory('MockERC20');
    const MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');

    [owner, reciever, user2, user3, user4, user5, user6, opcCollector, marketFeeCollector, publishMarketAccount, user7] = await ethers.getSigners();
    publishMarketFeeAddress = publishMarketAccount.address
    data = web3.utils.asciiToHex(constants.blob[0]);
    flags = web3.utils.asciiToHex(constants.blob[0]);

    // DEPLOY ROUTER, SETTING OWNER


    mockErc20 = await MockErc20.deploy(owner.address, "MockERC20", 'MockERC20');
    mockErc20Decimals = await MockErc20Decimals.deploy("Mock6Digits", 'Mock6Digits', 6);
    publishMarketFeeToken = mockErc20Decimals.address

    router = await Router.deploy(
      owner.address,
      '0x000000000000000000000000000000000000dead', // approved tokens list, unused in this test
      '0x000000000000000000000000000000000000dead', // pooltemplate field, unused in this test
      opcCollector.address,
      []
    );



    fixedRateExchange = await FixedRateExchange.deploy(
      router.address
    );

    dispenser = await Dispenser.deploy(router.address);

    templateERC20 = await ERC20Template.deploy();


    // SETUP ERC721 Factory with template
    templateERC721 = await ERC721Template.deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      templateERC20.address,
      router.address
    );

    // SET REQUIRED ADDRESS


    await router.addFactory(factoryERC721.address);

    await router.addFixedRateContract(fixedRateExchange.address); // DEPLOY ROUTER, SETTING OWNER
    await router.addDispenserContract(dispenser.address);



    // by default connect() in ethers goes with the first address (owner in this case)
    const tx = await factoryERC721.deployERC721Contract(
      "NFT",
      "NFTSYMBOL",
      1,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "https://oceanprotocol.com/nft/",
      true,
      owner.address
    );
    const txReceipt = await tx.wait();
    let event = getEventFromTx(txReceipt, 'NFTCreated')
    assert(event, "Cannot find NFTCreated event")
    tokenAddress = event.args[0];
    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);

    assert((await tokenERC721.balanceOf(owner.address)) == 1);

    await tokenERC721.addManager(user2.address);
    await tokenERC721.connect(user2).addTo725StoreList(user3.address);
    await tokenERC721.connect(user2).addToCreateERC20List(user3.address);
    await tokenERC721.connect(user2).addToMetadataList(user3.address);

    assert((await tokenERC721.getPermissions(user3.address)).store == true);
    assert(
      (await tokenERC721.getPermissions(user3.address)).deployERC20 == true
    );
    assert(
      (await tokenERC721.getPermissions(user3.address)).updateMetadata == true
    );
    const trxERC20 = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT1", "ERC20DT1Symbol"],
      [user3.address, user6.address, user3.address, addressZero],
      [cap, 0],
      []
    );
    const trxReceiptERC20 = await trxERC20.wait();
    event = getEventFromTx(trxReceiptERC20, 'TokenCreated')
    assert(event, "Cannot find TokenCreated event")
    erc20Address = event.args[0];

    erc20Token = await ethers.getContractAt("ERC20TemplateEnterprise", erc20Address);
    assert((await erc20Token.permissions(user3.address)).minter == true);


    // create an ERC20 with publish Fee ( 5 USDC, going to publishMarketAddress)
    const trxERC20WithPublishFee = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT1P", "ERC20DT1SymbolP"],
      [user3.address, user6.address, publishMarketFeeAddress, publishMarketFeeToken],
      [cap, web3.utils.toWei(publishMarketFeeAmount)],
      []

    );
    const trxReceiptERC20WithPublishFee = await trxERC20WithPublishFee.wait();
    event = getEventFromTx(trxReceiptERC20WithPublishFee, 'TokenCreated')
    assert(event, "Cannot find TokenCreated event")
    erc20AddressWithPublishFee = event.args[0];

    erc20TokenWithPublishFee = await ethers.getContractAt("ERC20TemplateEnterprise", erc20AddressWithPublishFee);
    assert((await erc20TokenWithPublishFee.permissions(user3.address)).minter == true);
    const BulkBuyAsset = await ethers.getContractFactory("BulkBuyAsset");
    bulkBuyAsset = await BulkBuyAsset.deploy();
  });


  it("should execute bulkBuyFromFreAndOrder successfully", async function () {
    const Mock20DecimalContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      mockErc20Decimals.address
    );

    // Create an ERC20 with a publish Fee
    const trxEnterpriseERC20 = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT1P", "ERC20DT1SymbolP"],
      [user3.address, user6.address, publishMarketFeeAddress, mockErc20Decimals.address],
      [cap, web3.utils.toWei(publishMarketFeeAmount)],
      []
    );

    const trxReceiptEnterpriseERC20 = await trxEnterpriseERC20.wait();
    const event = getEventFromTx(trxReceiptEnterpriseERC20, 'TokenCreated');
    const erc20Address = event.args[0];
    const EnterpriseToken = await ethers.getContractAt("ERC20TemplateEnterprise", erc20Address);

    assert(await EnterpriseToken.totalSupply() == 0, "Invalid Total Supply");

    let txDispenser = await EnterpriseToken.connect(user3).createDispenser(
      dispenser.address, web3.utils.toWei('1'), web3.utils.toWei('1'), true, addressZero)
    assert(txDispenser,
      'Cannot activate dispenser')
    await txDispenser.wait();
    const status = await dispenser.status(EnterpriseToken.address)
    assert(status.active === true, 'Dispenser not active')
    assert(status.owner === user3.address, 'Dispenser owner is not alice')
    assert(status.isMinter === true, 'Dispenser is not a minter')

    await expectRevert(
      dispenser
        .connect(user4)
        .dispense(EnterpriseToken.address, web3.utils.toWei('1'), user4.address),
      "This address is not allowed to request DT"
    );

    // Create a fixed rate exchange
    const tx = await EnterpriseToken.connect(user3).createFixedRate(
      fixedRateExchange.address,
      [mockErc20Decimals.address, user3.address, user3.address, addressZero],
      ['18', '18', web3.utils.toWei("1"), web3.utils.toWei("0.01"), 1, 0]
    );
    assert(tx, 'Cannot create fixed rate exchange');

    const txReceipt = await tx.wait();

    await expectRevert(
      dispenser
        .connect(user4)
        .dispense(EnterpriseToken.address, web3.utils.toWei('1'), user4.address),
      "This address is not allowed to request DT"
    );

    const exchangeEvent = getEventFromTx(txReceipt, 'NewFixedRate');
    const exchangeId = exchangeEvent.args[0];

    // Calculate the required base token amount for 1 DT
    const baseTokenAmountArray = await fixedRateExchange.calcBaseInGivenOutDT(
      exchangeId,
      web3.utils.toWei('1'),  // Always buying 1 DT
      0  // Assume no swap fee for simplicity in this test
    );

    const baseTokenAmountRequired = baseTokenAmountArray[0]; // Extract the base token amount
    const baseTokenAmountBN = ethers.BigNumber.from(baseTokenAmountRequired); // Ensure it's a BigNumber

    // Transfer tokens to pay for FRE (make sure to cover the calculated baseTokenAmount)
    await Mock20DecimalContract.connect(owner).transfer(user3.address, baseTokenAmountBN.add(web3.utils.toWei('1')));
    await Mock20DecimalContract.connect(user3).approve(bulkBuyAsset.address, baseTokenAmountBN.add(web3.utils.toWei('1')));
    // Prepare the bulk buy
    const providerFeeAmount = "0";
    const providerFeeAddress = user5.address;
    const providerFeeToken = addressZero;
    const providerData = JSON.stringify({ "timeout": 0 });
    const providerValidUntil = 0;

    // Sign provider data
    const message = ethers.utils.solidityKeccak256(
      ["bytes", "address", "address", "uint256", "uint256"],
      [
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
        providerFeeAddress,
        providerFeeToken,
        providerFeeAmount,
        providerValidUntil
      ]
    );
    const signedMessage = await signMessage(message, user5);

    const bulkOrderParams = {
      consumer: user3.address,
      serviceIndex: 1,
      _providerFees: [{
        providerFeeAddress: providerFeeAddress,
        providerFeeToken: providerFeeToken,
        providerFeeAmount: providerFeeAmount,
        v: signedMessage.v,
        r: signedMessage.r,
        s: signedMessage.s,
        providerData: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
        validUntil: providerValidUntil
      }],
      _consumeMarketFees: [{
        consumeMarketFeeAddress: user5.address,
        consumeMarketFeeToken: mockErc20Decimals.address,
        consumeMarketFeeAmount: 0
      }]
    };

    const bulkFreParams = {
      exchangeContracts: [fixedRateExchange.address],
      exchangeIds: [exchangeId],
      maxBaseTokenAmounts: [baseTokenAmountBN],
      swapMarketFees: [0],
      marketFeeAddresses: [user5.address]
    };

    // Debugging: Check balances and approvals before the call
    const preBalance = await Mock20DecimalContract.balanceOf(bulkBuyAsset.address);

    // Execute the bulk buy
    const txBulkBuy = await bulkBuyAsset.connect(user3).bulkBuyFromFreAndOrder(
      bulkOrderParams,
      bulkFreParams,
      [EnterpriseToken.address]
    );

    const receiptBulkBuy = await txBulkBuy.wait();

    // Assertions after the bulk buy
    const postBalance = await Mock20DecimalContract.balanceOf(bulkBuyAsset.address);

    assert(await EnterpriseToken.totalSupply() == web3.utils.toWei('0'), "Invalid Total Supply")
    assert(
      (await EnterpriseToken.balanceOf(user3.address)) == web3.utils.toWei("0")
    );

    assert(
      (await EnterpriseToken.balanceOf(await EnterpriseToken.getPaymentCollector())) ==
      web3.utils.toWei("0"), 'Invalid publisher reward, we should have burned the DT'
    );

  });

  it("should execute bulkBuyFromFreAndOrder successfully for two assets", async function () {
    const Mock20DecimalContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      mockErc20Decimals.address
    );

    // Step 1: Create the first ERC20 asset
    const trxERC20Asset1 = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT1A", "ERC20DT1SymbolA"],
      [user3.address, user6.address, publishMarketFeeAddress, mockErc20Decimals.address],
      [cap, web3.utils.toWei(publishMarketFeeAmount)],
      []
    );

    const trxReceiptERC20Asset1 = await trxERC20Asset1.wait();
    const eventAsset1 = getEventFromTx(trxReceiptERC20Asset1, 'TokenCreated');
    const erc20AddressAsset1 = eventAsset1.args[0];
    const Asset1Token = await ethers.getContractAt("ERC20TemplateEnterprise", erc20AddressAsset1);

    // Step 2: Create the second ERC20 asset
    const trxERC20Asset2 = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT2A", "ERC20DT2SymbolA"],
      [user3.address, user6.address, publishMarketFeeAddress, mockErc20Decimals.address],
      [cap, web3.utils.toWei(publishMarketFeeAmount)],
      []
    );

    const trxReceiptERC20Asset2 = await trxERC20Asset2.wait();
    const eventAsset2 = getEventFromTx(trxReceiptERC20Asset2, 'TokenCreated');
    const erc20AddressAsset2 = eventAsset2.args[0];
    const Asset2Token = await ethers.getContractAt("ERC20TemplateEnterprise", erc20AddressAsset2);

    // Step 3: Set up the first fixed rate exchange for Asset 1
    const txAsset1FRE = await Asset1Token.connect(user3).createFixedRate(
      fixedRateExchange.address,
      [mockErc20Decimals.address, user3.address, user3.address, addressZero],
      ['18', '18', web3.utils.toWei("1"), web3.utils.toWei("0.01"), 1, 0]
    );
    const txReceiptAsset1FRE = await txAsset1FRE.wait();
    const exchangeEventAsset1 = getEventFromTx(txReceiptAsset1FRE, 'NewFixedRate');
    const exchangeIdAsset1 = exchangeEventAsset1.args[0];

    // Step 4: Set up the second fixed rate exchange for Asset 2
    const txAsset2FRE = await Asset2Token.connect(user3).createFixedRate(
      fixedRateExchange.address,
      [mockErc20Decimals.address, user3.address, user3.address, addressZero],
      ['18', '18', web3.utils.toWei("1"), web3.utils.toWei("0.01"), 1, 0]
    );
    const txReceiptAsset2FRE = await txAsset2FRE.wait();
    const exchangeEventAsset2 = getEventFromTx(txReceiptAsset2FRE, 'NewFixedRate');
    const exchangeIdAsset2 = exchangeEventAsset2.args[0];

    // Step 5: Calculate the required base token amount for 1 DT for both assets
    const baseTokenAmountArrayAsset1 = await fixedRateExchange.calcBaseInGivenOutDT(
      exchangeIdAsset1,
      web3.utils.toWei('1'),  // Always buying 1 DT for Asset 1
      0  // Assume no swap fee for simplicity in this test
    );
    const baseTokenAmountAsset1 = ethers.BigNumber.from(baseTokenAmountArrayAsset1[0]);

    const baseTokenAmountArrayAsset2 = await fixedRateExchange.calcBaseInGivenOutDT(
      exchangeIdAsset2,
      web3.utils.toWei('1'),  // Always buying 1 DT for Asset 2
      0  // Assume no swap fee for simplicity in this test
    );
    const baseTokenAmountAsset2 = ethers.BigNumber.from(baseTokenAmountArrayAsset2[0]);

    // Step 6: Transfer tokens to pay for FRE (make sure to cover the calculated baseTokenAmounts)
    const totalBaseTokenAmountRequired = baseTokenAmountAsset1.add(baseTokenAmountAsset2);
    await Mock20DecimalContract.connect(owner).transfer(user3.address, totalBaseTokenAmountRequired.add(web3.utils.toWei('2')));
    await Mock20DecimalContract.connect(user3).approve(bulkBuyAsset.address, totalBaseTokenAmountRequired.add(web3.utils.toWei('2')));

    // Step 7: Prepare the bulk buy
    const providerFeeAmount = "0";
    const providerFeeAddress = user5.address;
    const providerFeeToken = addressZero;
    const providerData = JSON.stringify({ "timeout": 0 });
    const providerValidUntil = 0;

    // Sign provider data
    const message = ethers.utils.solidityKeccak256(
      ["bytes", "address", "address", "uint256", "uint256"],
      [
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
        providerFeeAddress,
        providerFeeToken,
        providerFeeAmount,
        providerValidUntil
      ]
    );
    const signedMessage = await signMessage(message, user5);

    const bulkOrderParams = {
      consumer: user3.address,
      serviceIndex: 1,
      _providerFees: [
        {
          providerFeeAddress: providerFeeAddress,
          providerFeeToken: providerFeeToken,
          providerFeeAmount: providerFeeAmount,
          v: signedMessage.v,
          r: signedMessage.r,
          s: signedMessage.s,
          providerData: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
          validUntil: providerValidUntil
        },
        {
          providerFeeAddress: providerFeeAddress,
          providerFeeToken: providerFeeToken,
          providerFeeAmount: providerFeeAmount,
          v: signedMessage.v,
          r: signedMessage.r,
          s: signedMessage.s,
          providerData: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
          validUntil: providerValidUntil
        }
      ],
      _consumeMarketFees: [
        {
          consumeMarketFeeAddress: user5.address,
          consumeMarketFeeToken: mockErc20Decimals.address,
          consumeMarketFeeAmount: 0
        },
        {
          consumeMarketFeeAddress: user5.address,
          consumeMarketFeeToken: mockErc20Decimals.address,
          consumeMarketFeeAmount: 0
        }
      ]
    };

    const bulkFreParams = {
      exchangeContracts: [fixedRateExchange.address, fixedRateExchange.address],
      exchangeIds: [exchangeIdAsset1, exchangeIdAsset2],
      maxBaseTokenAmounts: [baseTokenAmountAsset1, baseTokenAmountAsset2],
      swapMarketFees: [0, 0],
      marketFeeAddresses: [user5.address, user5.address]
    };

    // Step 8: Execute the bulk buy for two assets
    const txBulkBuy = await bulkBuyAsset.connect(user3).bulkBuyFromFreAndOrder(
      bulkOrderParams,
      bulkFreParams,
      [Asset1Token.address, Asset2Token.address]
    );

    const receiptBulkBuy = await txBulkBuy.wait();

    // Assertions after the bulk buy
    const postBalance = await Mock20DecimalContract.balanceOf(bulkBuyAsset.address);

  });

  it("should revert when there is a mismatch in the length of input arrays", async function () {
    const Mock20DecimalContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      mockErc20Decimals.address
    );

    const trxERC20Asset1 = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT1A", "ERC20DT1SymbolA"],
      [user3.address, user6.address, publishMarketFeeAddress, mockErc20Decimals.address],
      [cap, web3.utils.toWei(publishMarketFeeAmount)],
      []
    );

    const trxReceiptERC20Asset1 = await trxERC20Asset1.wait();
    const eventAsset1 = getEventFromTx(trxReceiptERC20Asset1, 'TokenCreated');
    const erc20AddressAsset1 = eventAsset1.args[0];
    const Asset1Token = await ethers.getContractAt("ERC20TemplateEnterprise", erc20AddressAsset1);

    const trxERC20Asset2 = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT2A", "ERC20DT2SymbolA"],
      [user3.address, user6.address, publishMarketFeeAddress, mockErc20Decimals.address],
      [cap, web3.utils.toWei(publishMarketFeeAmount)],
      []
    );

    const trxReceiptERC20Asset2 = await trxERC20Asset2.wait();
    const eventAsset2 = getEventFromTx(trxReceiptERC20Asset2, 'TokenCreated');
    const erc20AddressAsset2 = eventAsset2.args[0];
    const Asset2Token = await ethers.getContractAt("ERC20TemplateEnterprise", erc20AddressAsset2);

    const txAsset1FRE = await Asset1Token.connect(user3).createFixedRate(
      fixedRateExchange.address,
      [mockErc20Decimals.address, user3.address, user3.address, addressZero],
      ['18', '18', web3.utils.toWei("1"), web3.utils.toWei("0.01"), 1, 0]
    );
    const txReceiptAsset1FRE = await txAsset1FRE.wait();
    const exchangeEventAsset1 = getEventFromTx(txReceiptAsset1FRE, 'NewFixedRate');
    const exchangeIdAsset1 = exchangeEventAsset1.args[0];

    const txAsset2FRE = await Asset2Token.connect(user3).createFixedRate(
      fixedRateExchange.address,
      [mockErc20Decimals.address, user3.address, user3.address, addressZero],
      ['18', '18', web3.utils.toWei("1"), web3.utils.toWei("0.01"), 1, 0]
    );
    const txReceiptAsset2FRE = await txAsset2FRE.wait();
    const exchangeEventAsset2 = getEventFromTx(txReceiptAsset2FRE, 'NewFixedRate');
    const exchangeIdAsset2 = exchangeEventAsset2.args[0];

    const bulkOrderParams = {
      consumer: user3.address,
      serviceIndex: 1,
      _providerFees: [
        {
          providerFeeAddress: user5.address,
          providerFeeToken: addressZero,
          providerFeeAmount: 0,
          v: 27,
          r: ethers.constants.HashZero,
          s: ethers.constants.HashZero,
          validUntil: 0,
          providerData: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(""))
        }
      ],
      _consumeMarketFees: [
        {
          consumeMarketFeeAddress: user5.address,
          consumeMarketFeeToken: mockErc20Decimals.address,
          consumeMarketFeeAmount: 0
        },
        {
          consumeMarketFeeAddress: user5.address,
          consumeMarketFeeToken: mockErc20Decimals.address,
          consumeMarketFeeAmount: 0
        }
      ]
    };

    const bulkFreParams = {
      exchangeContracts: [fixedRateExchange.address, fixedRateExchange.address],
      exchangeIds: [exchangeIdAsset1, exchangeIdAsset2],
      maxBaseTokenAmounts: [ethers.BigNumber.from(1), ethers.BigNumber.from(1)],
      swapMarketFees: [0, 0],
      marketFeeAddresses: [user5.address, user5.address]
    };

    const _erc20TemplateEnterpriseAddresses = [
      Asset1Token.address,
      Asset2Token.address
    ]; // Length 2

    // Expect the transaction to revert due to the mismatch in array lengths
    await expectRevert(
      bulkBuyAsset.connect(user3).bulkBuyFromFreAndOrder(
        bulkOrderParams,
        bulkFreParams,
        _erc20TemplateEnterpriseAddresses
      ),
      "Mismatch in array lengths"
    );
  });

  it("should revert when attempting to bulk buy more than 5 assets", async function () {
    const Mock20DecimalContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      mockErc20Decimals.address
    );

    const assetTokens = [];
    const exchangeIds = [];

    for (let i = 0; i < 6; i++) {
      // Create an ERC20 asset
      const trxERC20 = await tokenERC721.connect(user3).createERC20(1,
        [`ERC20DT${i}`, `ERC20DT${i}Symbol`],
        [user3.address, user6.address, publishMarketFeeAddress, mockErc20Decimals.address],
        [cap, web3.utils.toWei(publishMarketFeeAmount)],
        []
      );
      const trxReceiptERC20 = await trxERC20.wait();
      const event = getEventFromTx(trxReceiptERC20, 'TokenCreated');
      const erc20Address = event.args[0];
      const assetToken = await ethers.getContractAt("ERC20TemplateEnterprise", erc20Address);

      assetTokens.push(assetToken);

      // Set up a Fixed Rate Exchange for each asset
      const txFRE = await assetToken.connect(user3).createFixedRate(
        fixedRateExchange.address,
        [mockErc20Decimals.address, user3.address, user3.address, addressZero],
        ['18', '18', web3.utils.toWei("1"), web3.utils.toWei("0.01"), 1, 0]
      );
      const txReceiptFRE = await txFRE.wait();
      const exchangeEvent = getEventFromTx(txReceiptFRE, 'NewFixedRate');
      exchangeIds.push(exchangeEvent.args[0]);
    }

    // Prepare bulk buy parameters for 6 assets
    const bulkOrderParams = {
      consumer: user3.address,
      serviceIndex: 1,
      _providerFees: assetTokens.map(() => ({
        providerFeeAddress: user5.address,
        providerFeeToken: addressZero,
        providerFeeAmount: 0,
        v: 27,
        r: ethers.constants.HashZero,
        s: ethers.constants.HashZero,
        validUntil: 0,
        providerData: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(""))
      })),
      _consumeMarketFees: assetTokens.map(() => ({
        consumeMarketFeeAddress: user5.address,
        consumeMarketFeeToken: mockErc20Decimals.address,
        consumeMarketFeeAmount: 0
      }))
    };

    const bulkFreParams = {
      exchangeContracts: assetTokens.map(() => fixedRateExchange.address), // 6 entries
      exchangeIds: exchangeIds, // 6 entries
      maxBaseTokenAmounts: assetTokens.map(() => ethers.BigNumber.from(1)), // 6 entries
      swapMarketFees: assetTokens.map(() => 0), // 6 entries
      marketFeeAddresses: assetTokens.map(() => user5.address) // 6 entries
    };

    const _erc20TemplateEnterpriseAddresses = assetTokens.map(token => token.address); // 6 entries

    // Expect the transaction to revert due to exceeding the maximum bulk buy limit
    await expectRevert(
      bulkBuyAsset.connect(user3).bulkBuyFromFreAndOrder(
        bulkOrderParams,
        bulkFreParams,
        _erc20TemplateEnterpriseAddresses
      ),
      "Maximum bulk buy is 5 assets"
    );
  });


});
