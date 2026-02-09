// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MegaLock} from "../src/MegaLock.sol";
import {MegaBurn} from "../src/MegaBurn.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        MegaLock megaLock = new MegaLock();
        console.log("MegaLock deployed at:", address(megaLock));

        MegaBurn megaBurn = new MegaBurn();
        console.log("MegaBurn deployed at:", address(megaBurn));

        vm.stopBroadcast();
    }
}
