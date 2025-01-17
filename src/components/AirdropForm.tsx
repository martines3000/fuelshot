import React, { useState, useMemo, useEffect } from "react";
import { Upload, FileSpreadsheet, ArrowLeft, Download, X, AlertCircle } from "lucide-react";
import TokenSelector from "./TokenSelector";
import { Airdrop } from "../sway-api/index.ts";
import { Address, bn } from "fuels";
import toast from "react-hot-toast";
import AirdropNFTForm from './AirdropNFTForm';
import { Token } from '../types/token';
import { useUnlockedWallet } from "../hooks/useUnlockedWallet.ts";


interface AirdropEntry {
  address: string;
  amount: string;
}

interface FailedEntry extends AirdropEntry {
  batchIndex: number;
}

// interface TokenSelectorProps {
//   selectedToken: Token | null;
//   onTokenSelect: (token: Token) => void;
//   tokens: Token[];
//   unknownTokens: Token[];
//   showUnknownAssets: boolean;
//   setShowUnknownAssets: (show: boolean) => void;
// }

const MAINNET_CONTRACT_ID =
  "0xcee11ba55ecf698c6a86c4444f515c5fe499049a0084208fd093186a7ac6e89f";
const TESTNET_CONTRACT_ID = "0xe9488080d7fce4e119a2676d9bbb8da2c8ffe12223debad7a4a8f22e632c281b";

// Add custom toast styles
const toastStyles = {
  success: {
    style: {
      background: 'rgb(0, 201, 167)', // fuel-green
      color: 'black',
      borderRadius: '6px',
    },
    iconTheme: {
      primary: 'black',
      secondary: 'rgb(0, 201, 167)',
    },
  },
  error: {
    style: {
      background: 'rgb(127, 29, 29)', // dark red background
      color: 'rgb(254, 202, 202)', // light red text
      borderRadius: '6px',
    },
    iconTheme: {
      primary: 'rgb(254, 202, 202)', // light red icon
      secondary: 'rgb(127, 29, 29)', // dark red background
    },
  },
};

const calculateTotalAmount = (entries: AirdropEntry[]): string => {
  return entries
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0)
    .toString();
};

function AirdropForm() {
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [addresses, setAddresses] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<'token' | 'recipients'>('token');
  const [privateKey, setPrivateKey] = useState<string | undefined>(undefined);
  const [selectedNetwork, setSelectedNetwork] = useState<'Testnet' | 'Mainnet'>('Testnet');
  const [connectedPrivateKey, setConnectedPrivateKey] = useState<string>("");
  const { wallet } = useUnlockedWallet(connectedPrivateKey, selectedNetwork);
  const [airdropType, setAirdropType] = useState<'tokens' | 'nfts'>('tokens');
  const contract = useMemo(() => {
    if (wallet) {
      const contractId = wallet.provider.getChainId() === 0 ? TESTNET_CONTRACT_ID : MAINNET_CONTRACT_ID;
      const contract = new Airdrop(contractId, wallet);
      return contract;
    }
    return null;
  }, [wallet]);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [failedEntries, setFailedEntries] = useState<FailedEntry[]>([]);
  const [showFailedEntries, setShowFailedEntries] = useState(false);
  const [recipientCount, setRecipientCount] = useState(0);
  const [totalAmount, setTotalAmount] = useState("0");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [unknownTokens, setUnknownTokens] = useState<Token[]>([]);
  const [showUnknownAssets, setShowUnknownAssets] = useState(false);
  const [nfts, setNFTs] = useState<Token[]>([]);
  const [selectedNFT, setSelectedNFT] = useState<Token | null>(null);
  const [fetchingAssets, setFetchingAssets] = useState(false);

  useEffect(() => {
    let mounted = true;
    setFetchingAssets(true);

    const fetchTokens = async () => {
      if (!wallet) return;

      try {
        const balances = await wallet.getBalances();
        const newTokens: Token[] = [];
        const newUnknownTokens: Token[] = [];
        const newNFTs: Token[] = [];

        await Promise.all(
          balances.balances.map(async (balance) => {
            const apiUrl =
              wallet.provider.getChainId() === 0
                ? `https://explorer-indexer-testnet.fuel.network/assets/${balance.assetId}`
                : `https://mainnet-explorer.fuel.network/assets/${balance.assetId}`;

            const response = await fetch(apiUrl);
            const metadata = await response.json();

            const tokenData = {
              assetId: balance.assetId,
              symbol: metadata.symbol || "Unknown",
              name: metadata.name || "Unknown Asset",
              isNFT: metadata.isNFT || false,
              balance: metadata.decimals
                ? balance.amount.format({ units: metadata.decimals }).toString()
                : balance.amount.toString(),
              decimals: metadata.decimals || 0,
            };

            if (tokenData.isNFT) {
              newNFTs.push(tokenData);
            } else if (!metadata.name) {
              newUnknownTokens.push(tokenData);
            } else {
              newTokens.push(tokenData);
            }
          })
        );

        if (mounted) {
          setTokens(newTokens);
          setUnknownTokens(newUnknownTokens);
          setNFTs(newNFTs);
        }
      } catch (error) {
        console.error('Error fetching tokens:', error);
      } finally {
        if (mounted) {
          setFetchingAssets(false);
        }
      }
    };

    setTokens([]);
    setUnknownTokens([]);
    setNFTs([]);
    fetchTokens();

    return () => {
      mounted = false;
    };
  }, [wallet]);

  const handleTokenSelect = (token: Token) => {
    setSelectedToken(token);
    setCurrentStep('recipients');
  };

  const handleBackToTokenSelection = () => {
    setCurrentStep('token');
  };

  const handleTextChange = (value: string) => {
    setAddresses(value);
    const entries = value
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [address, amount] = line
          .split(/[,\s]+/)
          .map((item) => item.trim());
        return { address, amount };
      });

    setRecipientCount(entries.length);
    setTotalAmount(calculateTotalAmount(entries));
  };

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setAddresses(text);
      // Calculate totals for the uploaded CSV
      const entries = text
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const [address, amount] = line
            .split(/[,\s]+/)
            .map((item) => item.trim());
          return { address, amount };
        });
      setRecipientCount(entries.length);
      setTotalAmount(calculateTotalAmount(entries));
    };
    reader.readAsText(file);
    // Reset the file input value after processing
    event.target.value = '';
  };

  const parseAddresses = (): AirdropEntry[] => {
    return addresses
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [address, amount] = line
          .split(/[,\s]+/)
          .map((item) => item.trim());
        return { address, amount };
      });
  };

  const BATCH_SIZE = 180; // Maximum number of addresses per transaction

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedToken) return;

    setIsProcessing(true);
    setFailedEntries([]); // Reset failed entries at start
    let successfulBatches = 0; // Add counter for successful batches

    try {
      const entries = parseAddresses();

      const totalBatches = Math.ceil(entries.length / BATCH_SIZE);
      setBatchProgress({ current: 0, total: totalBatches });

      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batchEntries = entries.slice(i, i + BATCH_SIZE);
        const batchIndex = Math.floor(i / BATCH_SIZE);

        try {
          const batchAddresses = batchEntries.map((entry) => ({
            Address: { bits: entry.address }
          }));

          const batchAmounts = batchEntries.map((entry) => bn.parseUnits(entry.amount, selectedToken.decimals));
          const batchTotalAmount = batchAmounts.reduce(
            (acc, amount) => acc.add(amount),
            bn(0)
          );

          console.log(
            `Processing batch ${batchIndex + 1}/${totalBatches}`,
            "for token:",
            selectedToken.assetId,
            batchAddresses,
            batchAmounts,
            batchTotalAmount.toString()
          );

          if (contract && wallet) {
            const scope = contract.functions
              .distribute_tokens(batchAddresses, batchAmounts)
              .callParams({
                forward: [batchTotalAmount, selectedToken.assetId],
              });

            const request = await scope.getTransactionRequest();
            const { coins } = await wallet.getCoins(selectedToken.assetId);

            const resources = await wallet.getResourcesToSpend([
              { amount: batchTotalAmount, assetId: selectedToken.assetId },
            ]);
            console.log("resources", resources);
            request.addResources(resources);
            request.addChangeOutput(wallet.address, selectedToken.assetId);
            request.addVariableOutputs(batchAmounts.length);

            const txCost = await wallet.getTransactionCost(request, {
              quantities: coins,
            });
            console.log("txCost", txCost);
            const { gasUsed, missingContractIds, maxFee } = txCost;
            missingContractIds.forEach((contractId) => {
              request.addContractInputAndOutput(Address.fromString(contractId));
            });

            request.gasLimit = gasUsed;
            request.maxFee = maxFee;
            await wallet.fund(request, txCost)
            console.log("request", request);
            const tx = await wallet.sendTransaction(request);
            await tx.wait();
            console.log(`Batch ${batchIndex + 1} transaction:`, tx);

            // Add success toast for each batch
            successfulBatches++;
            toast.success(`Batch ${batchIndex + 1}/${totalBatches} completed successfully!`, {
              duration: 3000,
              ...toastStyles.success,
            });
          }
        } catch (error) {
          console.error(`Batch ${batchIndex + 1} failed:`, error);
          // Add error toast for failed batches
          toast.error(`Batch ${batchIndex + 1}/${totalBatches} failed. Check failed entries for details.`, {
            duration: 5000,
            ...toastStyles.error,
          });

          const failedBatchEntries = batchEntries.map(entry => ({
            ...entry,
            batchIndex: batchIndex + 1
          }));
          setFailedEntries(prev => [...prev, ...failedBatchEntries]);
        }

        setBatchProgress({ current: batchIndex + 1, total: totalBatches });
      }

      // Show final summary toast
      if (successfulBatches === totalBatches) {
        toast.success('🎉 Airdrop completed successfully!', {
          duration: 5000,
          ...toastStyles.success,
        });
      }

    } catch (error) {
      console.error("Airdrop failed:", error);
      toast.error('Airdrop process failed. Please try again.', {
        duration: 5000,
        ...toastStyles.error,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadSample = () => {
    const sampleData =
      "0x0000000000000000000000000000000000000000000000000000000000000000,100\n0x0000000000000000000000000000000000000000000000000000000000000000,50";
    const blob = new Blob([sampleData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_airdrop.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const copyFailedEntriesToClipboard = () => {
    const text = failedEntries
      .map(entry => `${entry.address},${entry.amount}`)
      .join('\n');
    navigator.clipboard.writeText(text);
  };

  const handleNFTSelect = (nft: Token) => {
    setSelectedNFT(nft);
    // Add any additional logic needed when an NFT is selected
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            Fuel Shot
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Airdrop tokens seamlessly to your community
          </span>
        </div>
      </div>

      {wallet && (
        <div className="flex justify-start">
          <div className="inline-flex p-1 bg-gray-100 dark:bg-fuel-dark-700 rounded-lg">
            <div className="grid grid-cols-2 w-[300px]">
              <button
                onClick={() => setAirdropType("tokens")}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${airdropType === "tokens"
                  ? "bg-fuel-green text-black"
                  : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  }`}
              >
                Airdrop Tokens
              </button>
              <button
                onClick={() => setAirdropType("nfts")}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${airdropType === "nfts"
                  ? "bg-fuel-green text-black"
                  : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  }`}
              >
                Airdrop NFTs
              </button>
            </div>
          </div>
        </div>
      )}

      {!wallet ? (
        <div className="flex flex-col justify-center p-8 space-y-6 border-2 border-dashed border-gray-300 dark:border-fuel-dark-600 rounded-lg bg-gray-50 dark:bg-fuel-dark-800/90">
          <div className="text-center flex flex-col gap-y-8">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Enter you private key
            </h3>
            <input className="w-full bg-gray-100 dark:bg-fuel-dark-700 rounded-lg border border-gray-300 dark:border-fuel-dark-600 text-sm text-gray-900 dark:text-white outline-none focus:ring-fuel-green focus:border-fuel-green font-mono px-4 py-2"
              type="text" value={privateKey ?? ""} onChange={(e) => setPrivateKey(e.target.value)} placeholder="Private key" />
          </div>
          <div>
            <select value={selectedNetwork} onChange={(e) => setSelectedNetwork(e.target.value as "Testnet" | "Mainnet")} className="w-full bg-gray-100 dark:bg-fuel-dark-700 rounded-lg border border-gray-300 dark:border-fuel-dark-600 text-sm text-gray-900 dark:text-white outline-none focus:ring-fuel-green focus:border-fuel-green font-mono px-4 py-2">
              <option value="Testnet">Testnet</option>
              <option value="Mainnet">Mainnet</option>
            </select>
          </div>
          <div className="flex justify-center">
            <button className="px-6 py-3 border border-transparent text-sm font-medium rounded-md text-black dark:text-fuel-green bg-fuel-green dark:bg-transparent dark:border-fuel-green hover:bg-fuel-green/90 dark:hover:bg-fuel-green/10 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!privateKey}
              onClick={() => setConnectedPrivateKey(privateKey ?? "")}>Connect</button>
          </div>
        </div>
      ) : airdropType === "nfts" ? (
        <AirdropNFTForm
          nfts={nfts}
          selectedNFT={selectedNFT}
          onNFTSelect={handleNFTSelect}
          fetchingAssets={fetchingAssets}
        />
      ) : (
        <>
          {currentStep === "token" ? (
            <TokenSelector
              selectedToken={selectedToken}
              onTokenSelect={handleTokenSelect}
              tokens={tokens}
              unknownTokens={unknownTokens}
              showUnknownAssets={showUnknownAssets}
              setShowUnknownAssets={setShowUnknownAssets}
            />
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col space-y-4">
                <button
                  onClick={handleBackToTokenSelection}
                  className="inline-flex items-center text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <ArrowLeft className="w-5 h-5 mr-1" />
                  Back to Token Selection
                </button>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Selected Token: {selectedToken?.symbol}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-fuel-green">
                    Available balance: {selectedToken?.balance}{" "}
                    {selectedToken?.symbol}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      Recipients{" "}
                      <span className="text-fuel-green">({recipientCount})</span>
                    </h3>
                    {recipientCount > 0 && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Total amount to be airdropped:{" "}
                        <span className="text-fuel-green font-medium">
                          {totalAmount} {selectedToken?.symbol}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadSample}
                      className="cursor-pointer inline-flex items-center px-4 py-2 border border-fuel-green rounded-md text-sm font-medium text-black dark:text-fuel-green bg-fuel-green dark:bg-transparent hover:bg-fuel-green/90 dark:hover:bg-fuel-green/10"
                    >
                      <Download className="w-5 h-5 mr-2" />
                      Download Sample
                    </button>
                    <label className="cursor-pointer inline-flex items-center px-4 py-2 border border-fuel-green rounded-md text-sm font-medium text-black dark:text-fuel-green bg-fuel-green dark:bg-transparent hover:bg-fuel-green/90 dark:hover:bg-fuel-green/10">
                      <FileSpreadsheet className="w-5 h-5 mr-2" />
                      Upload CSV
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleCSVUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <textarea
                    rows={10}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-fuel-dark-600 rounded-md focus:ring-fuel-green focus:border-fuel-green font-mono text-sm bg-white dark:bg-fuel-dark-700 text-gray-900 dark:text-white outline-none"
                    placeholder="address,amount&#10;address,amount&#10;...&#10;&#10;Example:&#10;0x1234...5678,100&#10;0x8765...4321,50"
                    value={addresses}
                    onChange={(e) => handleTextChange(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full inline-flex justify-center items-center px-6 py-3 border border-transparent text-sm font-medium rounded-md text-black dark:text-fuel-green bg-fuel-green dark:bg-transparent dark:border-fuel-green hover:bg-fuel-green/90 dark:hover:bg-fuel-green/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      Processing...{" "}
                      {batchProgress
                        ? `(Batch ${batchProgress.current}/${batchProgress.total})`
                        : ""}
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 mr-2" />
                      Start Airdrop
                    </>
                  )}
                </button>
              </form>

              {failedEntries.length > 0 && (
                <div className="mt-4">
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
                        <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                          Failed Transactions
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowFailedEntries(!showFailedEntries)}
                        className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                      >
                        {showFailedEntries ? (
                          <X className="h-5 w-5" />
                        ) : (
                          <span className="text-sm">Show Details</span>
                        )}
                      </button>
                    </div>

                    {showFailedEntries && (
                      <div className="mt-4">
                        <p className="text-sm text-red-700 dark:text-red-300 mb-2">
                          {failedEntries.length} transactions failed. Click below to
                          copy the addresses and amounts to try again.
                        </p>
                        <button
                          type="button"
                          onClick={copyFailedEntriesToClipboard}
                          className="inline-flex items-center px-3 py-1.5 border border-red-300 dark:border-red-700 shadow-sm text-xs font-medium rounded text-red-700 dark:text-red-200 bg-white dark:bg-red-900/30 hover:bg-red-50 dark:hover:bg-red-900/50"
                        >
                          Copy Failed Entries
                        </button>
                        <div className="mt-2">
                          <textarea
                            readOnly
                            rows={5}
                            className="w-full px-3 py-2 text-xs font-mono border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                            value={failedEntries
                              .map((entry) => `${entry.address},${entry.amount}`)
                              .join("\n")}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AirdropForm;
