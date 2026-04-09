import React from 'react'

const VoteReceipt = ({ vote, candidateName }) => {
  if (!vote || !vote.candidateId) return null

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString()
  }

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text)
    alert(`${label} copied to clipboard!`)
  }

  return (
    <div className="card" style={{marginTop:16, background: '#f0fdf4', border: '2px solid #22c55e'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px'}}>
        <div style={{
          width: '48px',
          height: '48px',
          background: '#22c55e',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          color: '#fff'
        }}>
          ✓
        </div>
        <div>
          <h3 style={{margin: 0, color: '#15803d'}}>Vote Receipt</h3>
          <div style={{fontSize: '13px', color: '#6b7280'}}>
            Your vote has been recorded on the blockchain
          </div>
        </div>
      </div>

      <div style={{
        background: '#fff',
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid #d1fae5'
      }}>
        <div style={{display: 'grid', gap: '12px'}}>
          {/* Candidate */}
          <div>
            <div className="muted" style={{fontSize: '12px', marginBottom: '4px'}}>Voted For:</div>
            <div style={{fontWeight: 600, fontSize: '18px', color: '#15803d'}}>
              {candidateName || `Candidate #${vote.candidateId}`}
            </div>
          </div>

          {/* Timestamp */}
          {vote.timestamp && (
            <div>
              <div className="muted" style={{fontSize: '12px', marginBottom: '4px'}}>Submitted:</div>
              <div style={{fontSize: '14px'}}>{formatDate(vote.timestamp)}</div>
            </div>
          )}

          {/* Voter Address */}
          {vote.voterAddress && (
            <div>
              <div className="muted" style={{fontSize: '12px', marginBottom: '4px'}}>Voter Address:</div>
              <div style={{
                fontSize: '13px',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>{vote.voterAddress}</span>
                <button
                  onClick={() => copyToClipboard(vote.voterAddress, 'Address')}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    background: '#fff',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* Transaction Hash */}
          {vote.txHash && (
            <div>
              <div className="muted" style={{fontSize: '12px', marginBottom: '4px'}}>Transaction Hash:</div>
              <div style={{
                fontSize: '13px',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>{vote.txHash}</span>
                <button
                  onClick={() => copyToClipboard(vote.txHash, 'Transaction hash')}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    background: '#fff',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* IPFS CID */}
          {vote.cid && (
            <div>
              <div className="muted" style={{fontSize: '12px', marginBottom: '4px'}}>IPFS Content ID:</div>
              <div style={{
                fontSize: '13px',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px'
              }}>
                <span>{vote.cid}</span>
                <button
                  onClick={() => copyToClipboard(vote.cid, 'IPFS CID')}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    background: '#fff',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Copy
                </button>
              </div>
              {/* Verify on IPFS Gateway */}
              <div style={{marginTop: '8px'}}>
                <a
                  href={`https://gateway.pinata.cloud/ipfs/${vote.cid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    background: '#10b981',
                    color: '#fff',
                    textDecoration: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '500'
                  }}
                >
                  <span>🔍</span>
                  Verify on IPFS
                </a>
                <div style={{fontSize: '11px', color: '#6b7280', marginTop: '6px'}}>
                  View your vote data on the decentralized IPFS network
                </div>
              </div>
            </div>
          )}

          {/* Vote Hash (Blockchain Proof) */}
          {vote.voteHash && (
            <div>
              <div className="muted" style={{fontSize: '12px', marginBottom: '4px'}}>Vote Hash (Blockchain Proof):</div>
              <div style={{
                fontSize: '13px',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>{vote.voteHash}</span>
                <button
                  onClick={() => copyToClipboard(vote.voteHash, 'Vote hash')}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    background: '#fff',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Verification Note */}
        <div style={{
          marginTop: '16px',
          padding: '12px',
          background: '#eff6ff',
          borderRadius: '6px',
          fontSize: '12px',
          color: '#1e40af'
        }}>
          <div style={{fontWeight: 600, marginBottom: '4px'}}>🔒 Verification</div>
          <div>
            Your vote is permanently recorded on the blockchain and cannot be altered. 
            You can verify this transaction using the transaction hash above on a blockchain explorer.
          </div>
        </div>

        {/* Download/Print buttons */}
        <div style={{marginTop: '12px', display: 'flex', gap: '8px'}}>
          <button
            onClick={() => window.print()}
            className="vote-btn"
            style={{flex: 1, background: '#6b7280'}}
          >
            Print Receipt
          </button>
          <button
            onClick={() => {
              const receipt = JSON.stringify(vote, null, 2)
              const blob = new Blob([receipt], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `vote-receipt-${vote.candidateId}-${Date.now()}.json`
              a.click()
            }}
            className="vote-btn"
            style={{flex: 1, background: '#4f46e5'}}
          >
            Download Receipt
          </button>
        </div>
      </div>
    </div>
  )
}

export default VoteReceipt
