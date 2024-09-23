import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [searchValue, setSearchValue] = useState('');
  const [blockData, setBlockData] = useState(null);
  const [transactionData, setTransactionData] = useState(null);
  const [accountBalance, setAccountBalance] = useState(null);
  const [latestBlock, setLatestBlock] = useState(null);
  const [blockTimestamp, setBlockTimestamp] = useState(null);
  const [timeSinceBlock, setTimeSinceBlock] = useState('');

  const gethUrl = "https://node.alkebuleum.com";  // Geth RPC endpoint

  useEffect(() => {
    fetchLatestBlock();

    // Handle URL query parameters (tx, block, address)
    const queryParams = new URLSearchParams(window.location.search);
    const txHash = queryParams.get('tx');
    const blockNumber = queryParams.get('block');
    const address = queryParams.get('address');

    if (txHash) {
      fetchTransaction(txHash);
    } else if (blockNumber) {
      fetchBlock(blockNumber);
    } else if (address) {
      fetchAccountBalance(address);
    }

    // Refresh latest block info every 15 seconds
    const interval = setInterval(() => {
      fetchLatestBlock();
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const fetchLatestBlock = async () => {
    try {
      const latestBlockNumber = await fetchBlockNumber();
      setLatestBlock(latestBlockNumber);

      // Fetch block timestamp by latest block number
      const latestBlockData = await fetchBlockByNumber(latestBlockNumber);
      const blockTime = new Date(parseInt(latestBlockData.timestamp, 16) * 1000);
      setBlockTimestamp(blockTime);

      // Calculate the time difference from now
      const now = new Date();
      const diffInSeconds = Math.floor((now - blockTime) / 1000);
      const timeAgo = diffInSeconds < 60
        ? `${diffInSeconds} secs ago`
        : `${Math.floor(diffInSeconds / 60)} mins ago`;
      setTimeSinceBlock(timeAgo);
    } catch (error) {
      console.error("Error fetching latest block:", error);
    }
  };

  const handleSearch = async () => {
    try {
      const trimmedSearchValue = searchValue.trim();
      const isNumeric = /^[0-9]+$/.test(trimmedSearchValue);

      if (!isNumeric) {
        const normalizedSearchValue = trimmedSearchValue.toLowerCase();

        if (normalizedSearchValue.length === 42 && normalizedSearchValue.startsWith('0x')) {
          await fetchAccountBalance(normalizedSearchValue);
        } else if (normalizedSearchValue.length === 66 && normalizedSearchValue.startsWith('0x')) {
          await fetchTransaction(normalizedSearchValue);
        } else {
          alert("Invalid input, please enter a valid block number, transaction hash, or address.");
        }
      } else {
        await fetchBlock(trimmedSearchValue);
      }
    } catch (error) {
      console.error("Error in handleSearch:", error);
      alert(`An error occurred: ${error.message}`);
    }
  };

  const fetchAccountBalance = async (address) => {
    try {
      const response = await fetch(gethUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getBalance",
          params: [address, "latest"],
          id: 1
        })
      });
      const data = await response.json();
      if (data.result) {
        const balanceInEth = parseInt(data.result, 16) / 1e18;
        setAccountBalance(balanceInEth);
        setBlockData(null);
        setTransactionData(null);
      } else {
        alert('Account not found or no balance available');
      }
    } catch (error) {
      console.error("Error fetching account balance:", error);
      alert(`Error fetching account balance: ${error.message}`);
    }
  };

  const fetchBlock = async (blockNumber) => {
    const response = await fetch(gethUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: ["0x" + parseInt(blockNumber).toString(16), true],
        id: 1
      })
    });
    const data = await response.json();
    setBlockData(data.result);
    setTransactionData(null);
    setAccountBalance(null);
  };

  const fetchTransaction = async (txHash) => {
    const response = await fetch(gethUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionByHash",
        params: [txHash],
        id: 1
      })
    });
    const data = await response.json();
    if (data.result) {
      setTransactionData(data.result);
      setBlockData(null);
      setAccountBalance(null);
    } else {
      alert('Transaction not found');
    }
  };

  const fetchBlockNumber = async () => {
    const response = await fetch(gethUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1
      })
    });
    const data = await response.json();
    return parseInt(data.result, 16);
  };

  const fetchBlockByNumber = async (blockNumber) => {
    const response = await fetch(gethUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: ["0x" + blockNumber.toString(16), true],
        id: 1
      })
    });
    const data = await response.json();
    return data.result;
  };

  return (
    <div className="App">
      <header className="header">
        <h1>Alkebuleum Block Explorer</h1>
        <p>Search for a block, transaction hash, or address</p>
      </header>

      <div className="search-section">
        <input
          type="text"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder="Enter block number, transaction hash, or address"
        />
        <button onClick={handleSearch}>Search</button>
      </div>

      <main className="summary-section">
        {blockData && (
          <div className="block-summary card">
            <h3>Block Summary</h3>
            <p><strong>Block Number:</strong> {parseInt(blockData.number, 16)}</p>
            <p><strong>Block Hash:</strong> {blockData.hash}</p>
            <p><strong>Transaction Count:</strong> {blockData.transactions.length}</p>
            <p><strong>Timestamp:</strong> {new Date(parseInt(blockData.timestamp, 16) * 1000).toLocaleString()}</p>
          </div>
        )}

        {transactionData && (
          <div className="transaction-summary card">
            <h3>Transaction Summary</h3>
            <p><strong>Transaction Hash:</strong> {transactionData.hash}</p>
            <p><strong>From:</strong> {transactionData.from}</p>
            <p><strong>To:</strong> {transactionData.to}</p>
            <p><strong>Value:</strong> {parseInt(transactionData.value, 16) / 1e18} AKE</p>
            <p><strong>Gas Used:</strong> {transactionData.gas}</p>
          </div>
        )}

        {accountBalance !== null && (
          <div className="account-summary card">
            <h3>Account Balance</h3>
            <p><strong>Balance:</strong> {accountBalance} AKE</p>
          </div>
        )}
      </main>

      {/* Footer with Latest Block Info */}
      <footer className="footer">
        {latestBlock && (
          <div className="latest-block">
            <p><strong>Latest Block:</strong> {latestBlock}</p>
            <p>{timeSinceBlock} ({blockTimestamp && blockTimestamp.toLocaleString()})</p>
          </div>
        )}
      </footer>
    </div>
  );
}

export default App;
