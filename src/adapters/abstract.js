const utils = require('../utils')
const Big = require('big.js')
const StellarSdk = require('stellar-sdk')
const EventEmitter = require('events')
const Promise = require('../../node_modules/bluebird')

class Adapter extends EventEmitter {

  constructor (config) {
    super()

    this.config = config

    this.Account = config.models.account

    this.Account.events.on('DEPOSIT', (sourceAccount, amount) => {
      if (this.name === sourceAccount.adapter) {
        this.onDeposit(sourceAccount, amount.toFixed(7))
      }
    })
  }

  // *** +++ Deposit Hook Functions +
  async onDeposit (sourceAccount, amount) {
    // Override this or listen to events!
    this.emit('deposit', sourceAccount, amount)
  }

  async onTipWithInsufficientBalance (potentialTip, amount) {
    // Override this or listen to events!
    this.emit('tipWithInsufficientBalance', potentialTip, amount)
  }

  async onTipTransferFailed (potentialTip, amount) {
    // Override this or listen to events!
    this.emit('tipTransferFailed', potentialTip, amount)
  }

  async onTipReferenceError (potentialTip, amount) {
    // Override this or listen to events!
    this.emit('tipReferenceError', potentialTip, amount)
  }

  async onTip (potentialTip, amount) {
    // Override this or listen to events!
    this.emit('tip', potentialTip, amount)
  }

  // *** +++ Withdrawael Hook Functions +
  async onWithdrawalReferenceError (uniqueId, address, amount, hash) {
    // Override this or listen to events!
    this.emit('withdrawalReferenceError', uniqueId, address, amount, hash)
  }

  async onWithdrawalDestinationAccountDoesNotExist (uniqueId, address, amount, hash) {
    // Override this or listen to events!
    this.emit('withdrawalDestinationAccountDoesNotExist', uniqueId, address, amount, hash)
  }

  async onWithdrawalNoAddressProvided (uniqueId, address, amount, hash) {
    // Override this or listen to events!
    this.emit('withdrawalNoAddressProvided', uniqueId, address, amount, hash)
  }

  async onWithdrawalInvalidAmountProvided (uniqueId, address, amount, hash) {
    // Override this or listen to events!
    this.emit('withdrawalInvalidAmountProvided', uniqueId, address, amount, hash)
  }

  async onWithdrawalFailedWithInsufficientBalance (uniqueId, address, amount, hash) {
    // Override this or listen to events!
    this.emit('withdrawalFailedWithInsufficientBalance', uniqueId, address, amount, hash)
  }

  async onWithdrawalSubmissionFailed (uniqueId, address, amount, hash) {
    // Override this or listen to events!
    this.emit('withdrawalSubmissionFailed', uniqueId, address, amount, hash)
  }

  async onWithdrawalInvalidAddress (uniqueId, address ,amount, hash) {
    // Override this or listen to events!
   this.emit('withdrawalInvalidAddress', uniqueId, address, amount, hash)
  }

  async onWithdrawal (uniqueId, address, amount, hash) {
    // Override this or listen to events!
    this.emit('withdrawal', uniqueId, address, amount, hash)
  }

  async sendDepositConfirmation (sourceAccount, amount) {
      // Override me
  }

  async sendTransferConfirmation (sourceAccount, amount) {
      // Override me
  }

  // *** +++ Registration related functions +
  async onRegistrationBadWallet (walletAddressGiven) {
    return `${walletAddressGiven} is not a valid Public Key / wallet address`
  }

  async onRegistrationReplacedOldWallet(oldWallet, newWallet) {
    return `Your old wallet \`${oldWallet}\` has been replaced by \`${newWallet}\``
  }

  async onRegistrationSameAsExistingWallet(walletAddress) {
    return `You are already using the public key \`${walletAddress}\``
  }

  async onRegistrationOtherUserHasRegisteredWallet(walletAddress) {
    // TODO: Factor contact info out into env vars or something
    return `Another user has already registered the wallet address \`${walletAddress}\` If you think this is a mistake, please contact @dlohnes on Slack`
  }

  async onRegistrationRegisteredFirstWallet(walletAddress) {
    return `Successfully registered with wallet address \`${walletAddress}\`.\n\nSend XLM deposits to \`ROBOT_ADDRESS\` to make funds available for use with the '/tip' command.`
  }


  /**
     * // Being that each platform (Reddit, Twitter, Slack...) can have different
     * means of initiating the tipping process, and may even have multiple,
     * each adapter is responsible for handling the extraction of the tip amount
     * from users' commands.
     * @param tipText The original command given by the tipbot user
     */
  // extractTipAmount (tipText) {
  //   // Override me
  //     console.error("Abstract extractTipAmount() should not get called")
  //     return undefined
  // }

  /**
   *  Should receive a tip object like:
   *
   *  {
   *    adapter: "adapter_name", (e.g. "reddit")
   *    sourceId: "unique_source_id", (e.g. reddit username)
   *    targetId: "foo_bar" // the target id
   *    amount: "123.12",,
   *    hash: "asfcewef" // some kind of hash, e.g. comment hash, must be unique per sourceId
   *  }
   *
   *  You'll receive the tip object within every hook, so you can add stuff you need in the callbacks
   */
  async receivePotentialTip (tip) {
      // Let's see if the source has a sufficient balance
      const source = await this.Account.getOrCreate(tip.adapter, tip.sourceId)
      const payment = new Big(tip.amount)
      const hash = tip.hash

      if (!source.canPay(payment)) {
        return this.onTipWithInsufficientBalance(tip, payment.toFixed(7))
      }

      if (tip.sourceId === tip.targetId) {
        return this.onTipReferenceError(tip, payment.toFixed(7))
      }

      const target = await this.Account.getOrCreate(tip.adapter, tip.targetId)

      // ... and tip.
      source.transfer(target, payment, hash)
        .then(() => {
          this.onTip(tip, payment.toFixed(7))
        })
        .catch((exc) => {
          if (exc !== 'DUPLICATE_TRANSFER') {
            this.onTipTransferFailed(tip, payment.toFixed(7))
          }
        })
  }

  /**
   * Returns the balance for the requested adapter / uniqueId combination.
   *
   * A fresh account with an initial balance of zero is created if it does not exist.
   */
  requestBalance (adapter, uniqueId) {
    return new Promise(async (resolve, reject) => {
      const target = await this.Account.getOrCreate(adapter, uniqueId)
      resolve(target.balance)
    })
  }

  /**
   * Extract should be the result of utils.extractWithdrawal
   *
   * Hash should be a unique id (e.g. the message id)
   *
   * Should receive an object like this:
   *
   * {
   *     adapter: 'reddit',
   *     uniqueId: 'the-dark-coder'
   *     address?: 'aStellarAddress', // optional
   *     amount: '12.12'
   *     hash: 'aUniqueHash'
   * }
   */
  async receiveWithdrawalRequest (withdrawalRequest) {


    const adapter = withdrawalRequest.adapter
    const uniqueId = withdrawalRequest.uniqueId
    const hash = withdrawalRequest.hash
    const address = withdrawalRequest.address || await this.Account.walletAddressForUser(adapter, uniqueId)
    const amountRequested = withdrawalRequest.amount
    let withdrawalAmount;
    try {
      withdrawalAmount = new Big(amountRequested)
    } catch (e) {
      console.log(`Bad data fed to new Big() in Adapter::receiveWithdrawalRequest()\n${JSON.stringify(e)}`)
      console.log(`Withdrawal request amount is ${amountRequested}`)
      return this.onWithdrawalInvalidAmountProvided(uniqueId, address, amountRequested, hash)
    }
    const fixedAmount = withdrawalAmount.toFixed(7)

    if(typeof address === 'undefined' || address === null) {
      return this.onWithdrawalNoAddressProvided(uniqueId, address, fixedAmount, hash)
    }


    if (!StellarSdk.StrKey.isValidEd25519PublicKey(address)) {
      return this.onWithdrawalInvalidAddress(uniqueId, address, fixedAmount, hash)
    }

    // Fetch the account
    const target = await this.Account.getOrCreate(adapter, uniqueId)
    if (!target.canPay(withdrawalAmount)) {
      return this.onWithdrawalFailedWithInsufficientBalance(fixedAmount, target.balance)
    }

    // Withdraw
    try {
      await target.withdraw(this.config.stellar, address, withdrawalAmount, hash)
      return this.onWithdrawal(uniqueId, address, fixedAmount, hash)
    } catch (exc) {
      if (exc === 'WITHDRAWAL_DESTINATION_ACCOUNT_DOES_NOT_EXIST') {
        return this.onWithdrawalDestinationAccountDoesNotExist(uniqueId, address, fixedAmount, hash)
      }
      if (exc === 'WITHDRAWAL_REFERENCE_ERROR') {
        return this.onWithdrawalReferenceError(uniqueId, address, fixedAmount, hash)
      }
      if (exc === 'WITHDRAWAL_SUBMISSION_FAILED') {
        return this.onWithdrawalSubmissionFailed(uniqueId, address, fixedAmount, hash)
      }
      // throw (exc)
    }
  }

  /**
   * Validates the options provided and gives back an objet wher the key is the request option
   * and the value is the value which will be set on an account.
   *
   * Feel free to do any validation you like. Just be sure to handle errors / rejections to your liking.
   *
   * Technically 'options' can look like anything you want, but right now we only support changing wallet address.
   *
   * {
   *     walletAddress: 'GDTWLOWE34LFHN4Z3LCF2EGAMWK6IHVAFO65YYRX5TMTER4MHUJIWQKB',
   * }
   *
   */
    setAccountOptions(options) {
      let walletAddr = options.walletAddress
      if(!StellarSdk.StrKey.isValidEd25519PublicKey(walletAddr)) {
        throw new Error("setAccountOptions was given a bad public key")
      }
      // We could just return `options` here, but in the interest
      // of future proofing / illustrating what we're more likely to do later as
      // options are added...
      return {walletAddress : walletAddr}
  }
}

module.exports = Adapter