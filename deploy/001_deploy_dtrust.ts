import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
	verify
  } from "../helper-hardhat-config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts, network} = hre;
	const {deploy, log} = deployments;

	const chainId = network.config.chainId as number;
  	log(`Deploying Contract on chain Id #${chainId}`);

	const {deployer } = await getNamedAccounts();

	const deploymentVariables: any[] = [
		"0x52dCAFA2B5de94801F66A3E665d55DbB287E0Ac3"
	]

	log(`---------------Contract deployment now beginning--------------------`);
	const dTrustContract = await deploy("DTRUSTFactory", {
		from: deployer,
		args: deploymentVariables,
		log: true,
		waitConfirmations: 5,
	  });

	log(`---------------Contract deployment Complete--------------------`);
	if ( process.env.ETHERSCAN_API_KEY) {
		log("Verifying...");
		await verify(dTrustContract.address, deploymentVariables);
	}
	
};
export default func;
func.tags = ["all", "DTrust"];

// Settlor: 0x54A22b0C3883618967D808Ed7B352c835C76d49a
// Trustee: 0x12ca3e768caFD1549925E8E4ebf08A81e81A40Cf
// Beneficiary: 0x0f9a5ED9a5f87F2983A9D0c6172C49DC333e991a