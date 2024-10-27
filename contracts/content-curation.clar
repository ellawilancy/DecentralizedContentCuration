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

;; Content Counter
(define-data-var content-counter uint u0)

;; Administrative Functions
(define-public (set-min-stake (amount uint))
    (begin
        (asserts! (is-eq tx-sender contract-owner) ERR-NOT-AUTHORIZED)
        (ok (var-set min-stake-amount amount))
    )
)

;; Content Management Functions
(define-public (submit-content (content-hash (buff 32)))
    (let
        (
            (content-id (+ (var-get content-counter) u1))
            (stake-required (var-get min-stake-amount))
        )
        (asserts! (>= (stx-get-balance tx-sender) stake-required) ERR-INSUFFICIENT-STAKE)
        (try! (stx-transfer? stake-required tx-sender (as-contract tx-sender)))
        (map-set contents
            { content-id: content-id }
            {
                author: tx-sender,
                content-hash: content-hash,
                upvotes: u0,
                downvotes: u0,
                status: "active",
                stake: stake-required,
                timestamp: block-height
            }
        )
        (var-set content-counter content-id)
        (ok content-id)
    )
)

(define-public (vote-on-content (content-id uint) (vote-type (string-ascii 10)))
    (let
        (
            (content (unwrap! (map-get? contents { content-id: content-id }) ERR-CONTENT-NOT-FOUND))
            (curator-stat (default-to
                { total-votes: u0, reputation: u0, rewards-earned: u0 }
                (map-get? curator-stats { curator: tx-sender })
            ))
        )
        ;; Check if already voted
        (asserts! (is-none (map-get? votes { content-id: content-id, voter: tx-sender })) ERR-ALREADY-VOTED)

        ;; Record vote
        (map-set votes
            { content-id: content-id, voter: tx-sender }
            { vote-type: vote-type }
        )

        ;; Update content stats
        (map-set contents
            { content-id: content-id }
            (merge content
                {
                    upvotes: (if (is-eq vote-type "upvote")
                        (+ (get upvotes content) u1)
                        (get upvotes content)
                    ),
                    downvotes: (if (is-eq vote-type "downvote")
                        (+ (get downvotes content) u1)
                        (get downvotes content)
                    )
                }
            )
        )

        ;; Update curator stats
        (map-set curator-stats
            { curator: tx-sender }
            {
                total-votes: (+ (get total-votes curator-stat) u1),
                reputation: (+ (get reputation curator-stat) u1),
                rewards-earned: (get rewards-earned curator-stat)
            }
        )

        (ok true)
    )
)
