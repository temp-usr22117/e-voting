import React, { useEffect, useState } from 'react'
import { Web3 } from 'web3'
import { TransactionStatus } from './LoadingSpinner'
import config from '../config'

function Admin({ account, contractInfo, onActionSuccess, networkMismatch, selectedAddress }) {
  const [owner, setOwner] = useState(null)
  const [isOwner, setIsOwner] = useState(false)
  const [candidateName, setCandidateName] = useState('')
  const [voterAddress, setVoterAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [txStatus, setTxStatus] = useState(null)
  const [txHash, setTxHash] = useState(null)
  const [txError, setTxError] = useState(null)
  
  // Voting period state
  const [votingStart, setVotingStart] = useState('')
  const [votingEnd, setVotingEnd] = useState('')
  const [currentVotingPeriod, setCurrentVotingPeriod] = useState(null)
  const [votingStatus, setVotingStatus] = useState('not-set')
  const [votingPeriodSet, setVotingPeriodSet] = useState(false)
  
  // Track when account changes to update isOwner
  useEffect(() => {
    if (owner && account) {
      const match = account.toLowerCase() === owner.toLowerCase()
      setIsOwner(match)
    } else {
      setIsOwner(false)
    }
  }, [account, owner])

  // Load owner and voting period info once when contract info is available
  useEffect(() => {
    let mounted = true
    
    async function loadOwner() {
      try {
        if (!contractInfo || networkMismatch) {
          return
        }

        const web3 = window.ethereum ? new Web3(window.ethereum) : new Web3(config.rpcUrl)
        const contractAddr = selectedAddress || contractInfo.address
        const election = new web3.eth.Contract(contractInfo.abi, contractAddr)
        const o = await election.methods.owner().call()
        
        if (!mounted) return
        setOwner(o)
        
        // Load voting period
        const start = await election.methods.votingStart().call()
        const end = await election.methods.votingEnd().call()
        const periodSet = await election.methods.votingPeriodSet().call()
        
        if (!mounted) return
        setVotingPeriodSet(periodSet)
        
        if (periodSet) {
          setCurrentVotingPeriod({ start: Number(start), end: Number(end) })
          const now = Math.floor(Date.now() / 1000)
          if (now < Number(start)) {
            setVotingStatus('upcoming')
          } else if (now >= Number(start) && now <= Number(end)) {
            setVotingStatus('active')
          } else {
            setVotingStatus('ended')
          }
        } else {
          setVotingStatus('not-set')
        }
      } catch (e) {
        console.error('[Admin] Error loading owner:', e)
      }
    }
    loadOwner()
    
    return () => { mounted = false }
  }, [contractInfo, networkMismatch, selectedAddress])

  async function addCandidate() {
    const name = candidateName.trim()
    if (!name) {
      setNote('Enter a candidate name')
      return
    }
    if (/^0x[a-fA-F0-9]{40}$/.test(name)) {
      setNote('Candidate name cannot be an Ethereum address')
      return
    }
    if (name.length > 100) {
      setNote('Candidate name is too long (max 100 characters)')
      return
    }
    try {
      setBusy(true)
      setTxStatus('pending')
      setTxHash(null)
      setTxError(null)
      setNote('')
      
      const web3 = new Web3(window.ethereum)
      const contractAddr = selectedAddress || contractInfo.address
      const election = new web3.eth.Contract(contractInfo.abi, contractAddr)
      
      const receipt = await election.methods.addCandidate(candidateName.trim()).send({ from: account })
      
      setTxHash(receipt.transactionHash)
      setTxStatus('success')
      setCandidateName('')
      setNote('Candidate added successfully!')
      
      setTimeout(() => {
        setTxStatus(null)
        onActionSuccess && onActionSuccess()
      }, 3000)
    } catch (e) {
      const errorMsg = e.message || String(e)
      setTxStatus('error')
      setTxError(errorMsg)
      setNote('Failed to add candidate')
      console.error('[Admin] Add candidate error:', e)
    } finally {
      setBusy(false)
    }
  }

  async function registerVoter() {
    const addr = voterAddress.trim()
    if (!addr) {
      setNote('Enter voter address')
      return
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      setNote('Invalid Ethereum address format')
      return
    }
    setNote('')
    setBusy(true)
    setTxStatus('pending')
    setTxHash(null)
    setTxError(null)

    try {
      const web3 = new Web3(window.ethereum)
      const contractAddr = selectedAddress || contractInfo.address
      const election = new web3.eth.Contract(contractInfo.abi, contractAddr)
      const receipt = await election.methods.registerVoter(addr).send({from:account,gas:200000})
      console.log('registerVoter tx:', receipt)
      
      setTxHash(receipt.transactionHash)
      setTxStatus('success')
      setVoterAddress('')
      setNote(`Voter ${addr} registered`)
      onActionSuccess && onActionSuccess()
      
      setTimeout(() => {
        setTxStatus(null)
        setNote('')
      }, 3000)
    } catch (e) {
      console.error('registerVoter error:', e)
      setTxStatus('error')
      setTxError(e.message)
      setNote('Registration failed: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  async function setVotingPeriod() {
    if (!votingStart || !votingEnd) {
      setNote('Enter both start and end times')
      return
    }
    
    const startTimestamp = Math.floor(new Date(votingStart).getTime() / 1000)
    const endTimestamp = Math.floor(new Date(votingEnd).getTime() / 1000)
    const now = Math.floor(Date.now() / 1000)
    
    if (startTimestamp < now) {
      setNote('Start time must be in the future')
      return
    }
    if (endTimestamp <= startTimestamp) {
      setNote('End time must be after start time')
      return
    }
    
    setNote('')
    setBusy(true)
    setTxStatus('pending')
    setTxHash(null)
    setTxError(null)

    try {
      const web3 = new Web3(window.ethereum)
      const contractAddr = selectedAddress || contractInfo.address
      const election = new web3.eth.Contract(contractInfo.abi, contractAddr)
      const receipt = await election.methods.setVotingPeriod(startTimestamp, endTimestamp).send({from:account,gas:200000})
      console.log('setVotingPeriod tx:', receipt)
      
      setTxHash(receipt.transactionHash)
      setTxStatus('success')
      setCurrentVotingPeriod({ start: startTimestamp, end: endTimestamp })
      setVotingStatus('upcoming')
      setVotingPeriodSet(true)
      setNote('Voting period set successfully')
      onActionSuccess && onActionSuccess()
      
      setTimeout(() => {
        setTxStatus(null)
        setNote('')
      }, 3000)
    } catch (e) {
      console.error('setVotingPeriod error:', e)
      setTxStatus('error')
      setTxError(e.message)
      setNote('Failed to set voting period: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  async function cancelVotingPeriod() {
    if (!account || !contractInfo) return
    
    setNote('')
    setBusy(true)
    setTxStatus('pending')
    setTxHash(null)
    setTxError(null)

    try {
      const web3 = new Web3(window.ethereum)
      const contractAddr = selectedAddress || contractInfo.address
      const election = new web3.eth.Contract(contractInfo.abi, contractAddr)
      const receipt = await election.methods.cancelVotingPeriod().send({from:account,gas:100000})
      console.log('cancelVotingPeriod tx:', receipt)
      
      setTxHash(receipt.transactionHash)
      setTxStatus('success')
      setCurrentVotingPeriod(null)
      setVotingStatus('not-set')
      setVotingPeriodSet(false)
      setVotingStart('')
      setVotingEnd('')
      setNote('Voting period cancelled successfully')
      onActionSuccess && onActionSuccess()
      
      setTimeout(() => {
        setTxStatus(null)
        setNote('')
      }, 3000)
    } catch (e) {
      console.error('cancelVotingPeriod error:', e)
      setTxStatus('error')
      setTxError(e.message)
      setNote('Failed to cancel voting period: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!contractInfo || networkMismatch) return null

  return (
    <div className="card" style={{marginTop:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h3 style={{margin:0}}>Admin</h3>
        {owner && (
          <div className="muted" style={{fontSize:12}}>
            Owner: <span className="mono text-clip" title={owner}>{owner}</span>
          </div>
        )}
      </div>
      {!isOwner ? (
        <div className="muted" style={{marginTop:8,fontSize:13}}>
          Connect with the contract owner wallet to manage candidates and registrations.
        </div>
      ) : (
        <>
          {txStatus && <div style={{marginBottom:12}}><TransactionStatus status={txStatus} hash={txHash} error={txError} /></div>}
          
          {/* Voting Period Status */}
          <div style={{marginTop:10, padding:'12px', background: votingStatus === 'active' ? '#d1fae5' : votingStatus === 'ended' ? '#fee2e2' : '#f3f4f6', borderRadius:'8px'}}>
            <div style={{fontSize:13, fontWeight:600, marginBottom:4}}>
              Voting Status: {
                votingStatus === 'not-set' ? '⚪ Not Set' :
                votingStatus === 'upcoming' ? '🟡 Upcoming' :
                votingStatus === 'active' ? '🟢 Active' :
                '🔴 Ended'
              }
            </div>
            {currentVotingPeriod && (
              <div style={{fontSize:12, color:'#6b7280'}}>
                Start: {new Date(currentVotingPeriod.start * 1000).toLocaleString()}<br/>
                End: {new Date(currentVotingPeriod.end * 1000).toLocaleString()}
              </div>
            )}
          </div>
          
          <div style={{display:'grid',gap:10,marginTop:10}}>
            {/* Set Voting Period */}
            <div style={{padding:'12px', background:'#fff7ed', borderRadius:'8px', border:'1px solid #fed7aa'}}>
              <label className="muted" style={{fontSize:13, fontWeight:600}}>⏰ Set Voting Period</label>
              <div style={{display:'grid',gap:8,marginTop:8}}>
                <div>
                  <label style={{fontSize:12,color:'#6b7280'}}>Start Time</label>
                  <input 
                    type="datetime-local" 
                    value={votingStart} 
                    onChange={e=>setVotingStart(e.target.value)} 
                    style={{width:'100%', marginTop:4}} 
                    disabled={busy || votingStatus === 'active'}
                  />
                </div>
                <div>
                  <label style={{fontSize:12,color:'#6b7280'}}>End Time</label>
                  <input 
                    type="datetime-local" 
                    value={votingEnd} 
                    onChange={e=>setVotingEnd(e.target.value)} 
                    style={{width:'100%', marginTop:4}} 
                    disabled={busy || votingStatus === 'active'}
                  />
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button 
                    className="vote-btn" 
                    onClick={setVotingPeriod} 
                    disabled={busy || votingStatus === 'active'}
                    style={{flex:1, background: votingStatus === 'active' ? '#d1d5db' : undefined}}
                  >
                    {busy ? 'Setting...' : votingStatus === 'ended' ? 'Schedule New Period' : 'Set Voting Period'}
                  </button>
                  {votingPeriodSet && votingStatus === 'upcoming' && (
                    <button 
                      className="vote-btn" 
                      onClick={cancelVotingPeriod} 
                      disabled={busy}
                      style={{background:'#ef4444', minWidth:'auto', padding:'0 20px'}}
                    >
                      Cancel
                    </button>
                  )}
                </div>
                {votingStatus === 'active' && (
                  <div style={{fontSize:11,color:'#ef4444'}}>
                    Cannot change voting period during active voting
                  </div>
                )}
                {votingStatus === 'ended' && (
                  <div style={{fontSize:11,color:'#10b981'}}>
                    You can now schedule a new voting period for the next election
                  </div>
                )}
                {votingStatus === 'upcoming' && (
                  <div style={{fontSize:11,color:'#f59e0b'}}>
                    You can cancel or change the period before voting starts
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <label className="muted" style={{fontSize:13}}>Add candidate</label>
              <div style={{display:'flex',gap:8,marginTop:6}}>
                <input type="text" placeholder="Candidate name" value={candidateName} onChange={e=>setCandidateName(e.target.value)} style={{flex:1}} disabled={busy} />
                <button className="vote-btn" onClick={addCandidate} disabled={busy}>{busy ? 'Adding...' : 'Add'}</button>
              </div>
            </div>
            <div>
              <label className="muted" style={{fontSize:13}}>Register voter</label>
              <div style={{display:'flex',gap:8,marginTop:6}}>
                <input type="text" placeholder="0x..." value={voterAddress} onChange={e=>setVoterAddress(e.target.value)} style={{flex:1}} disabled={busy} />
                <button className="vote-btn" onClick={registerVoter} disabled={busy}>{busy ? 'Registering...' : 'Register'}</button>
              </div>
            </div>
          </div>
          {note && !txStatus && <div className="muted" style={{marginTop:8,fontSize:13}}>{note}</div>}
        </>
      )}
    </div>
  )
}

export default Admin