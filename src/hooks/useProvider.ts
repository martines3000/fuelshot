import { useProvider as useFuelProvider } from '@fuels/react';
import { Provider } from 'fuels';
import { useEffect, useState } from 'react';

export const useProvider = (network: "Testnet" | "Mainnet") => {
    const [customProvider, setCustomProvider] = useState<Provider | null>(null);
    const { provider } = useFuelProvider();

    useEffect(() => {
        Provider.create(network === "Testnet" ? "https://testnet.fuel.network/v1/graphql" : "https://mainnet.fuel.network/v1/graphql")
            .then((_provider) => setCustomProvider(_provider))
            .catch((error) => console.error(`Error creating provider: ${error}`));
    }, [network]);

    return { provider: provider ?? customProvider };
};
