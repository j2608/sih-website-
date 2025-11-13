// Minimal client-side blockchain (proof-of-work) using Web Crypto API for SHA-256
class Block {
    constructor(timestamp, transactions, previousHash = '') {
        this.timestamp = timestamp;
        this.transactions = transactions;
        this.previousHash = previousHash;
        this.nonce = 0;
        this.hash = '';
    }

    toHashString() {
        return `${this.previousHash}|${this.timestamp}|${JSON.stringify(this.transactions)}|${this.nonce}`;
    }
}

class Blockchain {
    constructor() {
        this.chain = [];
        this.pendingTransactions = [];
        this.difficulty = 3;
        this.miningReward = 1;
        this.load();
        if (this.chain.length === 0) this.createGenesisBlock();
    }

    createGenesisBlock() {
        const genesis = new Block(Date.now(), [{from: 'genesis', to: 'network', amount: 0}], '0');
        genesis.hash = '0';
        this.chain.push(genesis);
        this.save();
    }

    latestBlock() { return this.chain[this.chain.length - 1]; }

    async minePendingTransactions(minerAddress) {
        const block = new Block(Date.now(), this.pendingTransactions.slice(), this.latestBlock().hash);
        block.nonce = 0;
        const target = '0'.repeat(this.difficulty);
        // mining loop (async SHA-256)
        while (true) {
            const hash = await sha256(block.toHashString());
            if (hash.startsWith(target)) {
                block.hash = hash;
                break;
            }
            block.nonce++;
        }
        this.chain.push(block);
        // reward
        this.pendingTransactions = [{from: 'network', to: minerAddress, amount: this.miningReward}];
        this.save();
        return block;
    }

    createTransaction(tx) {
        if (!tx.from || !tx.to || typeof tx.amount !== 'number' || isNaN(tx.amount)) throw new Error('Invalid transaction');
        this.pendingTransactions.push(tx);
        this.save();
    }

    getBalanceOfAddress(address) {
        let balance = 0;
        for (const block of this.chain) {
            for (const tx of block.transactions) {
                if (tx.from === address) balance -= tx.amount;
                if (tx.to === address) balance += tx.amount;
            }
        }
        for (const tx of this.pendingTransactions) {
            if (tx.from === address) balance -= tx.amount;
            if (tx.to === address) balance += tx.amount;
        }
        return balance;
    }

    async isChainValid() {
        for (let i = 1; i < this.chain.length; i++) {
            const current = this.chain[i];
            const previous = this.chain[i - 1];
            const currentHash = await sha256(current.toHashString());
            if (current.hash !== currentHash) return false;
            if (current.previousHash !== previous.hash) return false;
            if (!current.hash.startsWith('0'.repeat(this.difficulty))) return false;
        }
        return true;
    }

    save() {
        try {
            localStorage.setItem('vnc_blockchain', JSON.stringify({chain: this.chain, pending: this.pendingTransactions}));
        } catch (e) { console.warn('Failed saving chain', e); }
    }

    load() {
        try {
            const raw = localStorage.getItem('vnc_blockchain');
            if (!raw) return;
            const parsed = JSON.parse(raw);
            this.chain = parsed.chain.map(b => Object.assign(new Block(b.timestamp, b.transactions, b.previousHash), {nonce: b.nonce, hash: b.hash}));
            this.pendingTransactions = parsed.pending || [];
        } catch (e) { console.warn('Failed loading chain', e); }
    }

    reset() {
        localStorage.removeItem('vnc_blockchain');
        this.chain = [];
        this.pendingTransactions = [];
        this.createGenesisBlock();
    }
}

// helper: sha256 returns hex digest of input string
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// UI wiring
const chainApp = new Blockchain();
const pendingEl = document.getElementById('pending-txs');
const chainOutput = document.getElementById('chain-output');
const balancesEl = document.getElementById('balances');
const mineStatus = document.getElementById('mine-status');

function renderPending() {
    if (!pendingEl) return;
    if (chainApp.pendingTransactions.length === 0) pendingEl.innerHTML = '<p class="muted">No pending transactions</p>';
    else pendingEl.innerHTML = chainApp.pendingTransactions.map((t,i)=>`<div class="muted">${i+1}. ${t.from} → ${t.to} : ${t.amount}</div>`).join('\n');
}

function renderChain() {
    chainOutput.textContent = JSON.stringify(chainApp.chain, null, 2);
    // balances
    const addresses = new Set();
    for (const b of chainApp.chain) for (const t of b.transactions) { addresses.add(t.from); addresses.add(t.to); }
    for (const t of chainApp.pendingTransactions) { addresses.add(t.from); addresses.add(t.to); }
    const rows = [];
    addresses.forEach(a => rows.push(`${a} : ${chainApp.getBalanceOfAddress(a)}`));
    balancesEl.textContent = rows.join('\n') || '(none)';
}

document.getElementById('btn-add-tx').addEventListener('click', ()=>{
    const from = document.getElementById('tx-sender').value.trim() || 'anonymous';
    const to = document.getElementById('tx-recipient').value.trim() || 'anonymous';
    const amount = parseFloat(document.getElementById('tx-amount').value) || 0;
    try {
        chainApp.createTransaction({from,to,amount});
        renderPending();
        renderChain();
    } catch (e) { alert(e.message); }
});

document.getElementById('btn-mine').addEventListener('click', async ()=>{
    const miner = document.getElementById('miner-address').value.trim() || 'miner';
    const diff = parseInt(document.getElementById('difficulty').value, 10) || 3;
    chainApp.difficulty = Math.max(1, Math.min(6, diff));
    mineStatus.textContent = 'Mining... (this may take a few seconds)';
    document.getElementById('btn-mine').disabled = true;
    try {
        const block = await chainApp.minePendingTransactions(miner);
        mineStatus.textContent = `Mined block ${chainApp.chain.length-1} (nonce=${block.nonce})`;
    } catch (e) {
        mineStatus.textContent = 'Mining failed: '+e.message;
    }
    document.getElementById('btn-mine').disabled = false;
    renderPending(); renderChain();
});

document.getElementById('btn-validate').addEventListener('click', async ()=>{
    mineStatus.textContent = 'Validating chain...';
    const ok = await chainApp.isChainValid();
    mineStatus.textContent = ok ? 'Chain is valid ✅' : 'Chain is INVALID ⚠️';
});

document.getElementById('btn-show-chain').addEventListener('click', ()=> renderChain());
document.getElementById('btn-reset').addEventListener('click', ()=>{ if(confirm('Reset chain?')){ chainApp.reset(); renderPending(); renderChain(); mineStatus.textContent='Chain reset'; }});

// initial render
renderPending(); renderChain();
