import React, { useEffect, useState, useRef } from 'react'
import { Web3 } from 'web3'
import { BrowserRouter, Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom'
import Auth from './components/Auth'
import Header from './components/Header'
import CandidateCard from './components/CandidateCard'
import Toast from './components/Toast'
import Admin from './components/Admin'
import Register from './components/Register'
import VoteReceipt from './components/VoteReceipt'
import config from './config'

// Utility function to truncate Ethereum addresses
function truncateAddress(address, startChars = 6, endChars = 4) {
  if (!address) return ''
  if (address.length <= startChars + endChars) return address
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`
}

function App() {
  const [account, setAccount] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [user, setUser] = useState(null)
  const [toast, setToast] = useState({ message: '', type: 'info' })
  const [lastVote, setLastVote] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [contractInfo, setContractInfo] = useState(null)
  const [selectedAddress, setSelectedAddress] = useState(null)
  const [chainCandidates, setChainCandidates] = useState(null)
  const [networkMismatch, setNetworkMismatch] = useState(null)
  const [isRegisteredOnChain, setIsRegisteredOnChain] = useState(null)
  const [ownerAddress, setOwnerAddress] = useState(null)
  const lastAutoLoginAccount = useRef(null)
  const [loginTrigger, setLoginTrigger] = useState(0)
  
  // Voting period state
  const [votingStatus, setVotingStatus] = useState('loading')
  const [votingPeriod, setVotingPeriod] = useState(null)
  
  // Dark mode state
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode')
    return saved ? JSON.parse(saved) : false
  })
  
  // Apply dark mode class to body
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode')
    } else {
      document.body.classList.remove('dark-mode')
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode))
  }, [darkMode])
  
  const toggleDarkMode = () => {
    setDarkMode(!darkMode)
  }

  useEffect(() => {
    async function init() {
      if (window.ethereum) {
        try {
          const web3 = new Web3(window.ethereum)
          const accounts = await window.ethereum.request({ method: 'eth_accounts' })
          if (accounts && accounts.length) setAccount(accounts[0])
          // keep in sync with wallet changes
          window.ethereum.on('accountsChanged', (accs) => setAccount(accs[0] || null))
        } catch (err) {
          // ignore
        }
      }
      // load candidates from backend
      try {
        const res = await fetch(`${config.backendUrl}/candidates`)
        const data = await res.json()
        setCandidates(data)
      } catch (e) {
        console.warn('could not fetch candidates', e)
      }

      // load contract info if available
      try {
        const resC = await fetch(`${config.backendUrl}/contract`)
        if (resC.ok) {
          const info = await resC.json()
          setContractInfo(info)
        }
      } catch (e) {
        console.warn('no contract info', e)
      }
    }
    // restore prior session if present
    try {
      const stored = localStorage.getItem('evote_user')
      if (stored) setUser(JSON.parse(stored))
    } catch {}
    init()
  }, [])

  // Load live candidates/counts from chain when contractInfo present
  useEffect(() => {
    let mounted = true
    
    async function loadFromChain() {
      if (!contractInfo || !window.ethereum) return
      try {
        const web3 = new Web3(window.ethereum)
        // Determine the correct contract address for the connected network
        const currentId = await web3.eth.net.getId()
        const addrByNet = contractInfo.addressesByNetwork || {}
        const addressForCurrent = addrByNet[currentId]
        let electionAddress = addressForCurrent || contractInfo.address
        if (!addressForCurrent) {
          const targetId = Number(contractInfo.networkId)
          if (currentId !== targetId) {
            if (mounted) {
              setNetworkMismatch({ currentId, targetId })
              setChainCandidates(null)
            }
            return
          }
          if (mounted) setNetworkMismatch(null)
        } else {
          // We have a contract deployed on this network id; proceed without mismatch
          if (mounted) setNetworkMismatch(null)
        }
        
        const election = new web3.eth.Contract(contractInfo.abi, electionAddress)
        if (mounted) setSelectedAddress(electionAddress)
        
        const count = await election.methods.candidatesCount().call()
        const list = []
        for (let i = 1; i <= Number(count); i++) {
          const c = await election.methods.getCandidate(i).call()
          list.push({ id: Number(c[0]), name: c[1], voteCount: Number(c[2]) })
        }
        if (mounted) setChainCandidates(list)
        
        // Load contract owner (for admin auto-detect). Try wallet provider first, then HTTP fallback.
        try {
          const o = await election.methods.owner().call()
          console.log('[App] Contract owner loaded:', o)
          // Only update if value actually changed to prevent triggering downstream effects
          if (mounted) {
            setOwnerAddress(prev => {
              if (prev && prev.toLowerCase() === o.toLowerCase()) {
                return prev // Don't trigger re-render if same value
              }
              return o
            })
          }
        } catch (err) {
          console.warn('[App] Failed to load owner from wallet provider:', err)
          // fallback: try local HTTP provider against the network-matched address
          try {
            const w3 = new Web3(config.rpcUrl)
            const nid = await w3.eth.net.getId()
            const addrByNet = contractInfo.addressesByNetwork || {}
            const addrFor = addrByNet[nid] || electionAddress
            const e2 = new w3.eth.Contract(contractInfo.abi, addrFor)
            const o2 = await e2.methods.owner().call()
            console.log('[App] Contract owner loaded (fallback):', o2)
            if (mounted) {
              setOwnerAddress(prev => {
                if (prev && prev.toLowerCase() === o2.toLowerCase()) {
                  return prev // Don't trigger re-render if same value
                }
                return o2
              })
            }
          } catch (err2) { 
            console.error('[App] Failed to load owner (fallback):', err2)
            if (mounted) setOwnerAddress(null)
          }
        }
        
        // Check registration status for current account if present
        if (account && mounted) {
          try {
            const reg = await election.methods.registered(account).call()
            setIsRegisteredOnChain(!!reg)
          } catch (e) {
            setIsRegisteredOnChain(null)
          }
        }
      } catch (e) {
        console.warn('failed to read candidates from chain', e)
      }
    }
    loadFromChain()
    
    return () => { mounted = false }
  }, [contractInfo, lastVote, account])

  // Check voting period status
  useEffect(() => {
    async function checkVotingStatus() {
      if (!contractInfo || !selectedAddress) {
        setVotingStatus('loading')
        return
      }
      
      try {
        const web3 = window.ethereum ? new Web3(window.ethereum) : new Web3(config.rpcUrl)
        const election = new web3.eth.Contract(contractInfo.abi, selectedAddress)
        
        const votingPeriodSet = await election.methods.votingPeriodSet().call()
        
        if (!votingPeriodSet) {
          setVotingStatus(prev => prev === 'not-set' ? prev : 'not-set')
          setVotingPeriod(prev => prev === null ? prev : null)
          return
        }
        
        const start = await election.methods.votingStart().call()
        const end = await election.methods.votingEnd().call()
        const startNum = Number(start)
        const endNum = Number(end)
        
        // Only update if values actually changed
        setVotingPeriod(prev => {
          if (prev && prev.start === startNum && prev.end === endNum) {
            return prev // Don't create new object if values are same
          }
          return { start: startNum, end: endNum }
        })
        
        const now = Math.floor(Date.now() / 1000)
        
        let newStatus
        if (now < startNum) {
          newStatus = 'upcoming'
        } else if (now >= startNum && now <= endNum) {
          newStatus = 'active'
        } else {
          newStatus = 'ended'
        }
        
        // Only update if status actually changed
        setVotingStatus(prev => prev === newStatus ? prev : newStatus)
        
      } catch (e) {
        console.error('[App] Error checking voting status:', e)
        setVotingStatus(prev => prev === 'not-set' ? prev : 'not-set')
      }
    }
    
    checkVotingStatus()
    // Check every 10 seconds to update status in real-time
    const interval = setInterval(checkVotingStatus, 10000)
    return () => clearInterval(interval)
  }, [contractInfo, selectedAddress, lastVote])

  // Auto-login when account is connected and owner address is known
  useEffect(() => {
    async function autoLogin() {
      if (!account || !contractInfo || !ownerAddress) {
        console.log('[App] Auto-login skip - missing requirements:', { account: !!account, contractInfo: !!contractInfo, ownerAddress: !!ownerAddress })
        return
      }
      
      // Check if we've already auto-logged in for this account in this session
      const accountKey = account.toLowerCase()
      
      // If loginTrigger changed, reset the ref to force re-login
      if (loginTrigger > 0) {
        console.log('[App] Login trigger detected - forcing re-login check')
        lastAutoLoginAccount.current = null
      }
      
      // Skip if user is logged in AND ref matches (and we're not forcing re-login)
      if (user && user.address && lastAutoLoginAccount.current === accountKey) {
        console.log('[App] Already auto-logged in for this account in this session')
        return
      }

      console.log('[App] Auto-login triggered - Account:', account, 'Owner:', ownerAddress, 'User state:', user ? 'logged in' : 'logged out', 'Trigger:', loginTrigger)
      lastAutoLoginAccount.current = accountKey
      
      // Check if account is the owner
      if (account.toLowerCase() === ownerAddress.toLowerCase()) {
        console.log('[App] Auto-login: Admin account detected!')
        const userData = { address: account, cid: null, role: 'admin' }
        setUser(userData)
        try { localStorage.setItem('evote_user', JSON.stringify(userData)) } catch {}
        setToast({ message: 'Logged in as Admin', type: 'success' })
        return
      }

      // Check if account is registered as voter on blockchain
      try {
        const web3 = new Web3(window.ethereum)
        const election = new web3.eth.Contract(contractInfo.abi, selectedAddress || contractInfo.address)
        const reg = await election.methods.registered(account).call()
        
        if (reg) {
          console.log('[App] Auto-login: Registered voter detected!')
          const userData = { address: account, cid: null, role: 'voter', verified: true }
          setUser(userData)
          try { localStorage.setItem('evote_user', JSON.stringify(userData)) } catch {}
          setToast({ message: 'Logged in as Voter', type: 'success' })
        } else {
          // Check if user completed registration on website but not verified by admin
          try {
            const map = JSON.parse(localStorage.getItem('demo_vid_map') || '{}')
            if (map[account.toLowerCase()]) {
              console.log('[App] Auto-login: Unverified registration found')
              const userData = { address: account, cid: null, role: 'voter', verified: false }
              setUser(userData)
              try { localStorage.setItem('evote_user', JSON.stringify(userData)) } catch {}
              setToast({ message: 'Logged in (Pending Admin Verification)', type: 'warning' })
              return
            }
          } catch {}
          
          console.log('[App] Account not registered')
          // Clear any previous login
          setUser(null)
          try { localStorage.removeItem('evote_user') } catch {}
        }
      } catch (e) {
        console.error('[App] Auto-login error:', e)
      }
    }
    
    autoLogin()
  }, [account, ownerAddress, contractInfo, selectedAddress, loginTrigger])

  const handleConnect = async () => {
    if (!window.ethereum) {
      setToast({ message: 'MetaMask not detected. Please install it to connect.', type: 'error' })
      return
    }
    try {
      // Ask MetaMask to show the account picker so you can switch to/imported admin
      try {
        await window.ethereum.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }]
        })
      } catch (_) { /* ignore; not all wallets support this cleanly */ }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      setAccount(accounts[0])
      // Reset the ref and trigger auto-login
      lastAutoLoginAccount.current = null
      setLoginTrigger(prev => prev + 1)
      setToast({ message: 'Wallet connected', type: 'success' })
    } catch (e) {
      setToast({ message: 'Connection rejected', type: 'error' })
    }
  }

  const handleLogout = () => {
    try { localStorage.removeItem('evote_user') } catch {}
    setUser(null)
    setLastVote(null)
    lastAutoLoginAccount.current = null // Reset to allow re-login
    setLoginTrigger(0) // Reset trigger back to 0
    setToast({ message: 'Logged out', type: 'success' })
  }

  const handleVote = async (candidateId) => {
    if (!account) {
      setToast({ message: 'Connect your wallet first', type: 'error' })
      return
    }
    if (user && user.verified === false) {
      setToast({ message: 'Voting is disabled. Your registration is pending admin verification.', type: 'error' })
      return
    }
    if (networkMismatch) {
      setToast({ message: `Wrong network: wallet on ${networkMismatch.currentId}, contract on ${networkMismatch.targetId}. Switch network in MetaMask.`, type: 'error' })
      return
    }
    if (votingStatus !== 'active') {
      const message = votingStatus === 'not-set' 
        ? 'Voting window has not been set by admin yet' 
        : votingStatus === 'upcoming'
        ? 'Voting has not started yet. Please wait.'
        : 'Voting has ended'
      setToast({ message, type: 'error' })
      return
    }
    try {
      setSubmitting(true)
      // Small helpers: timeout fetch and local CID fallback so UI never hangs
      const timeoutFetch = (url, options = {}, timeoutMs = 12000) => {
        const ac = new AbortController()
        const t = setTimeout(() => ac.abort(), timeoutMs)
        return fetch(url, { ...options, signal: ac.signal }).finally(() => clearTimeout(t))
      }
      const toHex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
      const computeFakeCid = async (str) => {
        const enc = new TextEncoder()
        const digest = await crypto.subtle.digest('SHA-256', enc.encode(str))
        const hex = toHex(digest)
        return 'Qm' + hex.slice(0, 44)
      }
      // 1) Build vote payload (prototype; not encrypted here)
      const payload = {
        voter: account,
        candidateId,
        ts: Date.now(),
        electionId: 'default'
      }

      // 2) Store on IPFS via backend (with timeout + local fallback)
      let cid = null
      try {
        setToast({ message: 'Uploading vote to IPFS…', type: 'info' })
        const res = await timeoutFetch(`${config.backendUrl}/ipfs/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!res.ok) throw new Error('IPFS upload failed')
        const data = await res.json()
        cid = data.hash // backend returns { hash }
      } catch (ipfsErr) {
        // Fallback: compute deterministic fake CID locally to avoid UI stall
        cid = await computeFakeCid(JSON.stringify(payload))
        setToast({ message: 'IPFS unavailable; using local hash fallback for demo', type: 'warning' })
      }

      // 3) Derive a hash we could send on-chain later (demonstration only)
      const web3 = new Web3(window.ethereum || Web3.givenProvider)
      const voteHash = web3.utils.sha3(JSON.stringify({ cid, candidateId, voter: account }))

      // 4) Optionally call the contract to record the vote on-chain
      if (contractInfo && window.ethereum) {
        const election = new web3.eth.Contract(contractInfo.abi, selectedAddress || contractInfo.address)
        try {
          // Re-check registration if unknown
          if (isRegisteredOnChain === null) {
            try {
              const reg = await election.methods.registered(account).call()
              if (!reg) {
                setToast({ message: 'On-chain voting requires registration. Ask the admin to register your wallet.', type: 'error' })
                return
              }
            } catch {}
          } else if (isRegisteredOnChain === false) {
            setToast({ message: 'On-chain voting requires registration. Ask the admin to register your wallet.', type: 'error' })
            return
          }

          setToast({ message: 'Please confirm the transaction in MetaMask…', type: 'info' })
          let txHash = null
          await new Promise((resolve, reject) => {
            const confirmTimer = setTimeout(() => reject(new Error('No confirmation from wallet. Check MetaMask.')) , 120000)
            election.methods
              .castVote(candidateId, voteHash)
              .send({ from: account, gas: 300000 })
              .on('transactionHash', (hash) => {
                txHash = hash
                clearTimeout(confirmTimer)
                setToast({ message: `Transaction sent: ${hash.slice(0, 10)}…`, type: 'success' })
                resolve(hash)
              })
              .on('error', (err) => { clearTimeout(confirmTimer); reject(err) })
          })
          // Fire-and-forget: try to poll receipt to refresh tallies, but don't fail UX if slow
          try {
            const pollOnce = async (tries = 10) => {
              const r = await web3.eth.getTransactionReceipt(txHash)
              if (r || tries <= 0) return r
              await new Promise(r => setTimeout(r, 1500))
              return pollOnce(tries - 1)
            }
            await pollOnce()
          } catch {}
          setToast({ message: `Vote submitted${cid ? ` (CID: ${cid.slice(0,10)}…)` : ''}. It may take a moment to finalize.`, type: 'success' })
          setLastVote({ cid, voteHash, candidateId, txHash, timestamp: Date.now(), voterAddress: account })
        } catch (txErr) {
          console.error('on-chain vote error', txErr)
          setToast({ message: `On-chain vote failed: ${txErr?.message || txErr}`, type: 'error' })
        }
      } else {
        setToast({ message: `Vote stored on IPFS (CID: ${cid.slice(0,10)}…)`, type: 'success' })
        setLastVote({ cid, voteHash, candidateId, timestamp: Date.now(), voterAddress: account })
      }
    } catch (e) {
      console.error('vote error', e)
      setToast({ message: `Vote error: ${e.message || e}`, type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const requestSwitchNetwork = async () => {
    // Switch wallet to local Ganache chain (default chainId 1337) instead of artifact networkId.
    if (!window.ethereum) return
    const chainIdHex = '0x539' // 1337 in hex
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] })
      setToast({ message: 'Switched network in wallet', type: 'success' })
      setLastVote({ ...(lastVote || {}), _ts: Date.now() })
    } catch (err) {
      // If the chain is not added to MetaMask, add it
      if (err && err.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: chainIdHex,
              chainName: config.chainName,
              rpcUrls: [config.rpcUrl],
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
            }]
          })
          setToast({ message: 'Network added. Try switching again if needed.', type: 'success' })
        } catch (e2) {
          setToast({ message: 'Failed to add network: ' + (e2.message || e2), type: 'error' })
        }
      } else {
        setToast({ message: 'Switch network failed: ' + (err.message || err), type: 'error' })
      }
    }
  }

  // Pages (defined inline to reuse state without prop drilling)
  const LoginPage = () => {
    const navigate = useNavigate()
    const [adminDetected, setAdminDetected] = useState(false)
    const handleLoggedIn = (u) => {
      setUser(u)
      try { localStorage.setItem('evote_user', JSON.stringify(u)) } catch {}
      navigate(`/u/${u.address}`)
    }
    
    // Auto-redirect when user is logged in (by the auto-login effect in App)
    useEffect(() => {
      if (user && user.address) {
        console.log('[LoginPage] User logged in, redirecting to home page')
        navigate(`/u/${user.address}`)
      }
    }, [user, navigate])
    
    // Detect admin wallet
    useEffect(() => {
      if (!user && account && ownerAddress && !networkMismatch) {
        setAdminDetected(account.toLowerCase() === ownerAddress.toLowerCase())
      } else {
        setAdminDetected(false)
      }
    }, [user, account, ownerAddress, networkMismatch])
    return (
      <div className="layout">
        <div>
          {contractInfo && networkMismatch && (
            <div className="card" style={{marginBottom:12, background:'#fff7ed', color:'#9a3412'}}>
              <div>
                Your wallet is connected to network {networkMismatch.currentId}, but the contract is on {networkMismatch.targetId}. Switch networks in MetaMask and then login.
              </div>
              <div style={{marginTop:8}}>
                <button className="vote-btn" onClick={requestSwitchNetwork}>Switch network in MetaMask</button>
              </div>
            </div>
          )}
          {account && !user && contractInfo && !networkMismatch && (
            <div className="card" style={{marginBottom:12, background:'#f0fdf4', color:'#065f46'}}>
              <div style={{fontSize:14}}>
                {adminDetected ? (
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{padding:'2px 8px', background:'#059669', color:'#fff', borderRadius:999, fontSize:12, fontWeight:700}}>ADMIN</div>
                    <div>Admin account detected! Auto-logging you in...</div>
                  </div>
                ) : isRegisteredOnChain ? (
                  <div>✓ Wallet connected. Registered voter detected! Auto-logging you in...</div>
                ) : isRegisteredOnChain === false ? (
                  (() => {
                    // Check if user has local registration
                    try {
                      const map = JSON.parse(localStorage.getItem('demo_vid_map') || '{}')
                      if (map[account.toLowerCase()]) {
                        return (
                          <div style={{background:'#fef3c7',color:'#92400e',padding:12,borderRadius:8}}>
                            <div style={{fontWeight:600,marginBottom:4}}>⚠️ Registration Pending Admin Verification</div>
                            <div style={{fontSize:13}}>
                              You have completed website registration, but your wallet is not verified on the blockchain yet. 
                              Please ask the admin to approve your registration.
                            </div>
                          </div>
                        )
                      }
                    } catch {}
                    return (
                      <div style={{background:'#fef2f2',color:'#991b1b',padding:12,borderRadius:8}}>
                        ⚠️ This wallet is not registered. Please go to Register page to complete verification.
                      </div>
                    )
                  })()
                ) : (
                  <div>✓ Wallet connected. Checking registration status...</div>
                )}
              </div>
            </div>
          )}
          <Auth onLogin={handleLoggedIn} />
        </div>
      </div>
    )
  }

  const HomePage = () => {
    const { address } = useParams()
    if (!user) {
      const stored = localStorage.getItem('evote_user')
      if (!stored) return <Navigate to="/" replace />
      try { setUser(JSON.parse(stored)) } catch {}
    }
    // Optional guard: address in URL should match logged-in user
    if (user && address && user.address.toLowerCase() !== address.toLowerCase()) {
      return <Navigate to={`/u/${user.address}`} replace />
    }
    return (
      <div className="layout">
        <div>
          <div className="card" style={{marginTop:0}}>
            <h3 style={{marginTop:0,marginBottom:12,fontSize:16}}>System Information</h3>
            <div style={{display:'grid',gap:10}}>
              {/* Current User Address */}
              <div>
                <div className="muted" style={{fontSize:12,marginBottom:4}}>Connected Address</div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div 
                    className="mono info-box" 
                    style={{
                      flex:1,
                      fontSize:14,
                      cursor: account ? 'pointer' : 'default'
                    }} 
                    title={account ? `${account} (click to copy)` : 'Not connected'}
                    onClick={() => {
                      if (account) {
                        navigator.clipboard.writeText(account)
                        setToast({ message: 'Address copied!', type: 'success' })
                      }
                    }}
                  >
                    {account ? truncateAddress(account, 10, 8) : 'Not connected'}
                  </div>
                  {user && user.role === 'admin' && (
                    <div className="badge" style={{background:'#059669'}}>ADMIN</div>
                  )}
                  {user && user.role === 'voter' && user.verified && (
                    <div className="badge" style={{background:'#0284c7'}}>VOTER</div>
                  )}
                  {user && user.role === 'voter' && !user.verified && (
                    <div className="badge" style={{background:'#f59e0b'}}>PENDING</div>
                  )}
                </div>
              </div>

              {/* Contract Owner */}
              {ownerAddress && (
                <div>
                  <div className="muted" style={{fontSize:12,marginBottom:4}}>Contract Owner (Admin)</div>
                  <div 
                    className="mono info-box" 
                    style={{
                      fontSize:13,
                      cursor:'pointer'
                    }} 
                    title={`${ownerAddress} (click to copy)`}
                    onClick={() => {
                      navigator.clipboard.writeText(ownerAddress)
                      setToast({ message: 'Owner address copied!', type: 'success' })
                    }}
                  >
                    {truncateAddress(ownerAddress, 10, 8)}
                  </div>
                </div>
              )}

              {/* Contract Address */}
              {contractInfo && (
                <div>
                  <div className="muted" style={{fontSize:12,marginBottom:4}}>Contract Address</div>
                  <div 
                    className="mono info-box" 
                    style={{
                      fontSize:13,
                      cursor:'pointer'
                    }} 
                    title={`${selectedAddress || contractInfo.address} (click to copy)`}
                    onClick={() => {
                      const addr = selectedAddress || contractInfo.address
                      navigator.clipboard.writeText(addr)
                      setToast({ message: 'Contract address copied!', type: 'success' })
                    }}
                  >
                    {truncateAddress(selectedAddress || contractInfo.address, 10, 8)}
                  </div>
                </div>
              )}

              {/* Network Info */}
              {contractInfo && (
                <div>
                  <div className="muted" style={{fontSize:12,marginBottom:4}}>Network</div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div className="info-box" style={{fontSize:13,flex:1}}>
                      {networkMismatch ? (
                        <span className="network-error">
                          ⚠️ Mismatch (Wallet: {networkMismatch.currentId}, Contract: {networkMismatch.targetId})
                        </span>
                      ) : (
                        <span className="network-ok">
                          ✓ Chain ID: {contractInfo.networkId}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Registration Status */}
              <div>
                <div className="muted" style={{fontSize:12,marginBottom:4}}>Registration Status</div>
                <div className="info-box" style={{fontSize:13}}>
                  {!user ? (
                    <span className="muted">Not logged in</span>
                  ) : user.role === 'admin' ? (
                    <span className="network-ok">✓ Admin Account</span>
                  ) : user.verified ? (
                    <span className="network-ok">✓ Verified Voter (Blockchain Registered)</span>
                  ) : (
                    <span style={{color:'#f59e0b'}}>⚠️ Pending Admin Verification</span>
                  )}
                </div>
              </div>
              
              {/* Voting Window Status */}
              <div>
                <div className="muted" style={{fontSize:12,marginBottom:4}}>Voting Window</div>
                <div className="info-box" style={{fontSize:13}}>
                  {votingStatus === 'loading' && <span className="muted">Checking...</span>}
                  {votingStatus === 'not-set' && <span className="muted">⏸️ Not Set</span>}
                  {votingStatus === 'upcoming' && <span style={{color:'#f59e0b'}}>⏳ Upcoming</span>}
                  {votingStatus === 'active' && <span className="network-ok">🟢 Active - Voting Open!</span>}
                  {votingStatus === 'ended' && <span className="network-error">🔴 Ended</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          {user && user.verified === false && (
            <div className="card" style={{marginBottom:16, background:'#fef3c7', color:'#92400e', borderLeft:'4px solid #f59e0b'}}>
              <div style={{display:'flex',alignItems:'start',gap:10}}>
                <div style={{fontSize:20}}>⚠️</div>
                <div>
                  <div style={{fontWeight:600,marginBottom:4}}>Registration Pending Admin Verification</div>
                  <div style={{fontSize:13,lineHeight:1.5}}>
                    You have completed registration on the website, but your wallet address has not been verified by the admin on the blockchain yet. 
                    You can view candidates, but <b>voting is disabled</b> until the admin approves your registration.
                  </div>
                  <div style={{fontSize:13,marginTop:8,padding:8,background:'#fffbeb',borderRadius:4}}>
                    <b>Your Wallet:</b> <span className="mono" style={{fontSize:12}}>{truncateAddress(account, 10, 8)}</span>
                  </div>
                  <div style={{fontSize:12,marginTop:6,opacity:0.8}}>
                    Please contact the admin to verify your wallet address.
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="card" style={{marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <h2 style={{margin:0}}>Candidates</h2>
              <div className="muted" style={{fontSize:13}}>{(chainCandidates ? chainCandidates.length : candidates.length)} total</div>
            </div>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div className="muted" style={{fontSize:13}}>
              {contractInfo ? (networkMismatch ? 'Contract found, but wallet is on a different network' : 'Showing on-chain candidates') : 'Showing backend candidates'}
            </div>
            <button className="vote-btn" style={{background:'#374151'}} onClick={() => setLastVote({ ...lastVote })}>Refresh tally</button>
          </div>
          {contractInfo && networkMismatch && (
            <div className="card" style={{marginTop:12, background:'#fff7ed', color:'#9a3412'}}>
              <div>
                Your wallet is connected to network {networkMismatch.currentId}, but the contract is on {networkMismatch.targetId}. Switch networks in MetaMask and refresh.
              </div>
              <div style={{marginTop:8}}>
                <button className="vote-btn" onClick={requestSwitchNetwork}>Switch network in MetaMask</button>
              </div>
            </div>
          )}
          {contractInfo && !networkMismatch && isRegisteredOnChain === false && user && user.role !== 'admin' && (
            <div className="card" style={{marginTop:12, background:'#fef2f2', color:'#7f1d1d'}}>
              This wallet is not registered on-chain. Ask the admin (contract owner) to register you.
            </div>
          )}
          {contractInfo && !networkMismatch && chainCandidates && chainCandidates.length === 0 && (
            <div className="card" style={{marginTop:12, background:'#fff7ed', color:'#9a3412'}}>
              No on-chain candidates yet. Ask the admin to add candidates (Login as Admin on the home page), or redeploy the contracts with seeds.
            </div>
          )}
          
          {/* Voting Status Messages for Voters */}
          {user && user.role !== 'admin' && votingStatus !== 'loading' && votingStatus !== 'active' && (
            <div className="card" style={{
              marginTop:12, 
              background: votingStatus === 'not-set' ? '#eff6ff' : votingStatus === 'upcoming' ? '#fef3c7' : '#fee2e2',
              border: `2px solid ${votingStatus === 'not-set' ? '#3b82f6' : votingStatus === 'upcoming' ? '#f59e0b' : '#ef4444'}`
            }}>
              <div style={{display:'flex',alignItems:'start',gap:12}}>
                <div style={{fontSize:28}}>
                  {votingStatus === 'not-set' ? '⏸️' : votingStatus === 'upcoming' ? '⏳' : '🔒'}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:16,marginBottom:8,color:'#1f2937'}}>
                    {votingStatus === 'not-set' && '⏸️ Voting Window Not Set'}
                    {votingStatus === 'upcoming' && '⏳ Voting Starts Soon'}
                    {votingStatus === 'ended' && '🔒 Voting Has Ended'}
                  </div>
                  <div style={{fontSize:14,color:'#4b5563',lineHeight:1.6}}>
                    {votingStatus === 'not-set' && (
                      <>
                        The admin has not set up the voting period yet. 
                        <br/>Please wait for the admin to start the voting window.
                      </>
                    )}
                    {votingStatus === 'upcoming' && votingPeriod && (
                      <>
                        Voting will begin at: <b>{new Date(votingPeriod.start * 1000).toLocaleString()}</b>
                        <br/>Please check back when voting opens.
                      </>
                    )}
                    {votingStatus === 'ended' && votingPeriod && (
                      <>
                        Voting ended at: <b>{new Date(votingPeriod.end * 1000).toLocaleString()}</b>
                        <br/>Thank you for participating!
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Show candidates only if admin OR voting is active */}
          {(user && user.role === 'admin') || votingStatus === 'active' ? (
            <div className="candidate-grid" style={{marginTop:12}}>
              {(chainCandidates || candidates).map(c => (
                <CandidateCard 
                  key={c.id} 
                  candidate={c} 
                  onVote={handleVote} 
                  disabled={!account || submitting || (user && user.verified === false) || votingStatus !== 'active'}
                  showVoteCount={user && user.role === 'admin'}
                  isAdmin={user && user.role === 'admin'}
                />
              ))}
            </div>
          ) : null}

          <VoteReceipt 
            vote={lastVote} 
            candidateName={lastVote && chainCandidates.find(c => c.id === lastVote.candidateId)?.name}
          />

          {contractInfo && user && ownerAddress && user.address && ownerAddress && (user.address.toLowerCase() === ownerAddress.toLowerCase()) && !networkMismatch && (
            <Admin
              account={account}
              contractInfo={contractInfo}
              selectedAddress={selectedAddress}
              networkMismatch={networkMismatch}
              onActionSuccess={() => setLastVote({ ...lastVote })}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Header
          account={account}
          onConnect={handleConnect}
          user={user}
          onLogout={handleLogout}
          contractInfo={contractInfo}
          ownerAddress={ownerAddress}
          networkMismatch={networkMismatch}
          selectedAddress={selectedAddress}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
        />

        <div className="hero">
          <div>
            <h1>Secure, transparent e‑voting</h1>
            <p>Sign in with your wallet, register, and cast a verifiable vote. Prototype uses Ethereum + IPFS.</p>
          </div>
        </div>

        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/register" element={<Register />} />
          <Route path="/u/:address" element={<HomePage />} />
        </Routes>

        <div className="footer">© {new Date().getFullYear()} E‑Voting Prototype — for research & demo use</div>

        <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />
      </div>
    </BrowserRouter>
  )
}

export default App