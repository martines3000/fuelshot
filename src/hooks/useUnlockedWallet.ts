import { Wallet } from "fuels";
import { useMemo } from "react";
import { useProvider } from "./useProvider";

export const useUnlockedWallet = (privateKey: string | undefined, network: "Testnet" | "Mainnet") => {
    const { provider } = useProvider(network);

    const unlockedWallet = useMemo(() => {
        if (provider && privateKey) {
            try {
                const unlockedWallet = Wallet.fromPrivateKey(privateKey, provider);
                return unlockedWallet;
            } catch (e) {
                console.log(e);
                return null;
            }
        }
        return null;
    }, [provider, privateKey]);

    return { wallet: unlockedWallet };
};