// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
pragma solidity 0.8.12;

import "../interfaces/IFixedRateExchange.sol";
import "../interfaces/IERC20TemplateEnterprise.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract BulkBuyAsset is ReentrancyGuard, Ownable {
    
    using SafeERC20 for IERC20;

    struct providerFee {
        address providerFeeAddress;
        address providerFeeToken; // address of the token marketplace wants to add fee on top
        uint256 providerFeeAmount; // amount to be transferred to marketFeeCollector
        uint8 v; // v of provider signed message
        bytes32 r; // r of provider signed message
        bytes32 s; // s of provider signed message
        uint256 validUntil; //validity expressed in unix timestamp
        bytes providerData; //data encoded by provider
    }
    struct consumeMarketFee {
        address consumeMarketFeeAddress;
        address consumeMarketFeeToken; // address of the token marketplace wants to add fee on top
        uint256 consumeMarketFeeAmount; // amount to be transferred to marketFeeCollector
    }
    struct BulkOrderParams {
        address consumer;
        uint256 serviceIndex;
        providerFee[] _providerFees;
        consumeMarketFee[] _consumeMarketFees;
    }
    struct BulkFreParams {
        address[] exchangeContracts;
        bytes32[] exchangeIds;
        uint256[] maxBaseTokenAmounts;
        uint256[] swapMarketFees;
        address[] marketFeeAddresses;
    }

    function bulkBuyFromFreAndOrder(
        BulkOrderParams calldata _bulkOrderParams,
        BulkFreParams calldata _bulkFreParams,
        address[] calldata _erc20TemplateEnterpriseAddresses
    ) external nonReentrant {
        require(
            _bulkFreParams.exchangeContracts.length == _bulkOrderParams._providerFees.length &&
            _bulkFreParams.exchangeContracts.length == _erc20TemplateEnterpriseAddresses.length &&
            _bulkFreParams.exchangeContracts.length == _bulkOrderParams._consumeMarketFees.length,
            "Mismatch in array lengths"
        );
        require(
            _bulkFreParams.exchangeContracts.length <= 5,
            "Maximum bulk buy is 5 assets"
        );

        for (uint i = 0; i < _bulkFreParams.exchangeContracts.length; i++) {
            // Individual parameters for the current iteration
            IERC20TemplateEnterprise.OrderParams memory orderParams = IERC20TemplateEnterprise.OrderParams({
                consumer: _bulkOrderParams.consumer,
                serviceIndex: _bulkOrderParams.serviceIndex,
                _providerFee: IERC20TemplateEnterprise.providerFee({
                    providerFeeAddress: _bulkOrderParams._providerFees[i].providerFeeAddress,
                    providerFeeToken: _bulkOrderParams._providerFees[i].providerFeeToken,
                    providerFeeAmount: _bulkOrderParams._providerFees[i].providerFeeAmount,
                    v: _bulkOrderParams._providerFees[i].v,
                    r: _bulkOrderParams._providerFees[i].r,
                    s: _bulkOrderParams._providerFees[i].s,
                    validUntil: _bulkOrderParams._providerFees[i].validUntil,
                    providerData: _bulkOrderParams._providerFees[i].providerData
                }),
                _consumeMarketFee: IERC20TemplateEnterprise.consumeMarketFee({
                    consumeMarketFeeAddress: _bulkOrderParams._consumeMarketFees[i].consumeMarketFeeAddress,
                    consumeMarketFeeToken: _bulkOrderParams._consumeMarketFees[i].consumeMarketFeeToken,
                    consumeMarketFeeAmount: _bulkOrderParams._consumeMarketFees[i].consumeMarketFeeAmount
                })
            });

            IERC20TemplateEnterprise.FreParams memory freParams = IERC20TemplateEnterprise.FreParams({
                exchangeContract: _bulkFreParams.exchangeContracts[i],
                exchangeId: _bulkFreParams.exchangeIds[i],
                maxBaseTokenAmount: _bulkFreParams.maxBaseTokenAmounts[i],
                swapMarketFee: _bulkFreParams.swapMarketFees[i],
                marketFeeAddress: _bulkFreParams.marketFeeAddresses[i]
            });

            // Retrieve the base token address from the exchange
            IFixedRateExchange fre = IFixedRateExchange(freParams.exchangeContract);
            (
                ,
                address datatoken,
                ,
                address baseToken,
                ,
                ,
                ,
                ,
                ,
                ,
                ,

            ) = fre.getExchange(freParams.exchangeId);
            
            // Ensure this contract has enough base tokens to proceed
            (uint256 baseTokenAmount, , , ) = fre.calcBaseInGivenOutDT(
                freParams.exchangeId,
                1e18,  // Always buying 1 DT
                freParams.swapMarketFee
            );
            require(baseTokenAmount <= freParams.maxBaseTokenAmount, "Too many base tokens");
            // Transfer the necessary base tokens from the user to this contract
            IERC20(baseToken).safeTransferFrom(msg.sender, address(this), baseTokenAmount);

            // Approve the first contract to spend the base tokens
            IERC20(baseToken).safeIncreaseAllowance(_erc20TemplateEnterpriseAddresses[i], baseTokenAmount);

            // Create an instance of the ERC20TemplateEnterprise interface
            IERC20TemplateEnterprise erc20TemplateEnterprise = IERC20TemplateEnterprise(_erc20TemplateEnterpriseAddresses[i]);

            // Call the buyFromFreAndOrder method using the interface
            erc20TemplateEnterprise.buyFromFreAndOrder(orderParams, freParams);
        }
    }
}
