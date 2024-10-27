;; Content Curation DAO
;; A decentralized platform for content curation with community governance

;; Constants
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INVALID-CONTENT (err u101))
(define-constant ERR-ALREADY-VOTED (err u102))
(define-constant ERR-INSUFFICIENT-STAKE (err u103))
(define-constant ERR-CONTENT-NOT-FOUND (err u104))

;; Data Variables
(define-data-var min-stake-amount uint u100)
(define-data-var reward-pool uint u0)

;; Data Maps
(define-map contents
    { content-id: uint }
    {
        author: principal,
        content-hash: (buff 32),
        upvotes: uint,
        downvotes: uint,
        status: (string-ascii 20),
        stake: uint,
        timestamp: uint
    }
)

(define-map curator-stats
    { curator: principal }
    {
        total-votes: uint,
        reputation: uint,
        rewards-earned: uint
    }
)

(define-map votes
    { content-id: uint, voter: principal }
    { vote-type: (string-ascii 10) }
)
