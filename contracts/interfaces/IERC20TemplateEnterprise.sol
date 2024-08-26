// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.12;

interface IERC20TemplateEnterprise {

    struct providerFee {
        address providerFeeAddress;
        address providerFeeToken;
        uint256 providerFeeAmount;
        uint8 v;
        bytes32 r;
        bytes32 s;
        uint256 validUntil;
        bytes providerData;
    }

    struct consumeMarketFee {
        address consumeMarketFeeAddress;
        address consumeMarketFeeToken;
        uint256 consumeMarketFeeAmount;
    }

    struct OrderParams {
        address consumer;
        uint256 serviceIndex;
        providerFee _providerFee;
        consumeMarketFee _consumeMarketFee;
    }

    struct FreParams {
        address exchangeContract;
        bytes32 exchangeId;
        uint256 maxBaseTokenAmount;
        uint256 swapMarketFee;
        address marketFeeAddress;
    }

    /**
     * @notice Executes a purchase from a Fixed Rate Exchange and orders the corresponding service.
     * @dev This function is non-reentrant.
     * @param _orderParams The parameters needed for the order.
     * @param _freParams The parameters needed for the fixed rate exchange transaction.
     */
    function buyFromFreAndOrder(
        OrderParams calldata _orderParams,
        FreParams calldata _freParams
    ) external;
}
