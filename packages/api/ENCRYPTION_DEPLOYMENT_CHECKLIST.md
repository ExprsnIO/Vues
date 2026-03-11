# Payment Encryption Deployment Checklist

Use this checklist when deploying payment credential encryption to each environment.

## Pre-Deployment

### Code Review
- [ ] Review encryption implementation in `src/utils/encryption.ts`
- [ ] Review route updates in `src/routes/payments*.ts`
- [ ] Review test results (all 27 tests passing)
- [ ] Review security specifications in docs

### Key Generation
- [ ] Generate secure encryption key: `openssl rand -base64 32`
- [ ] Verify key is at least 32 characters long
- [ ] Store key in secure location (password manager, vault)
- [ ] Create backup copy of key in separate secure location

## Development Environment

### Setup
- [ ] Set `ENCRYPTION_KEY` in `.env` file
- [ ] Verify key is not committed to git
- [ ] Run tests: `pnpm test src/utils/__tests__/encryption.test.ts`
- [ ] Verify all tests pass (27/27)

### Migration
- [ ] Run dry-run: `pnpm encrypt:credentials:dry-run`
- [ ] Review output for any issues
- [ ] Run actual encryption: `pnpm encrypt:credentials`
- [ ] Verify all credentials encrypted successfully

### Testing
- [ ] Test creating new payment config
- [ ] Test updating payment config
- [ ] Test processing payment with encrypted credentials
- [ ] Test webhook verification with encrypted credentials
- [ ] Verify payment gateway connections work
- [ ] Test admin payment operations

## Staging Environment

### Pre-Deployment
- [ ] Generate staging-specific encryption key (different from dev/prod)
- [ ] Store key in staging secrets manager (e.g., AWS Secrets Manager)
- [ ] Backup database before changes
- [ ] Schedule maintenance window if needed

### Deployment
- [ ] Set `ENCRYPTION_KEY` environment variable from secrets manager
- [ ] Deploy code changes
- [ ] Verify application starts successfully
- [ ] Check logs for encryption-related errors

### Migration
- [ ] SSH/console into staging environment
- [ ] Run dry-run: `pnpm encrypt:credentials:dry-run`
- [ ] Review output carefully
- [ ] Run encryption: `pnpm encrypt:credentials`
- [ ] Verify success message

### Verification
- [ ] Test payment config creation via API
- [ ] Test payment processing end-to-end
- [ ] Test refund processing
- [ ] Test webhook handling
- [ ] Check database - verify credentials are encrypted
- [ ] Test admin payment operations
- [ ] Review application logs for errors

### Rollback Plan
- [ ] Document rollback procedure
- [ ] Keep database backup accessible
- [ ] Keep old code version deployed on standby
- [ ] Document how to restore unencrypted credentials if needed

## Production Environment

### Pre-Deployment Planning
- [ ] Schedule deployment during low-traffic period
- [ ] Notify team of deployment schedule
- [ ] Prepare rollback plan
- [ ] Set up monitoring alerts
- [ ] Backup production database
- [ ] Test complete flow on staging one more time

### Key Management
- [ ] Generate production-specific encryption key
- [ ] Store key in production secrets manager
- [ ] Store backup copy in separate secure vault
- [ ] Document key location (without exposing key)
- [ ] Set up key rotation reminder (90 days)
- [ ] Restrict access to key (security team only)

### Deployment
- [ ] Deploy code to production
- [ ] Set `ENCRYPTION_KEY` from secrets manager
- [ ] Verify application starts
- [ ] Monitor error logs carefully

### Migration
- [ ] Connect to production environment securely
- [ ] Run dry-run: `pnpm encrypt:credentials:dry-run`
- [ ] Review all configs that will be encrypted
- [ ] Confirm with team lead/security
- [ ] Run encryption: `pnpm encrypt:credentials`
- [ ] Monitor execution closely
- [ ] Verify success message

### Verification (Critical)
- [ ] Test payment config API (read existing configs)
- [ ] Process test payment (in test mode)
- [ ] Process real payment (small amount)
- [ ] Verify payment succeeds end-to-end
- [ ] Check webhook processing
- [ ] Test refund processing
- [ ] Verify admin operations work
- [ ] Monitor logs for 30 minutes
- [ ] Check error tracking (Sentry, etc.)

### Production Monitoring
- [ ] Set up alerts for decryption failures
- [ ] Set up alerts for encryption failures
- [ ] Monitor payment processing success rate
- [ ] Monitor API error rates
- [ ] Check database performance
- [ ] Verify no customer-facing issues

## Post-Deployment

### Immediate (First Hour)
- [ ] Monitor application logs
- [ ] Monitor error tracking
- [ ] Verify payment processing
- [ ] Check webhook handling
- [ ] Review API response times
- [ ] Confirm no customer complaints

### First 24 Hours
- [ ] Review payment success rates
- [ ] Check for any decryption errors
- [ ] Monitor application performance
- [ ] Review customer support tickets
- [ ] Verify all payment providers working

### First Week
- [ ] Weekly review of encryption metrics
- [ ] Verify no payment processing issues
- [ ] Check database performance
- [ ] Review any customer issues
- [ ] Update documentation if needed

### Long-term
- [ ] Schedule key rotation (90 days)
- [ ] Document lessons learned
- [ ] Update runbook if needed
- [ ] Review security posture
- [ ] Plan for key versioning

## Security Verification

### Key Security
- [ ] Encryption key not in source code
- [ ] Key not in git history
- [ ] Key stored in secrets manager
- [ ] Backup key in separate vault
- [ ] Access to key is restricted
- [ ] Audit logging enabled for key access

### Data Security
- [ ] Credentials encrypted in database
- [ ] Credentials not in logs
- [ ] Credentials not in error messages
- [ ] Credentials sanitized in audit logs
- [ ] Test mode keys clearly marked

### Compliance
- [ ] PCI DSS requirements met
- [ ] Data at rest encrypted
- [ ] Key management documented
- [ ] Audit trail established
- [ ] Security review completed

## Rollback Procedure

If issues occur:

### Immediate Rollback
1. [ ] Stop encryption migration if in progress
2. [ ] Revert to previous code version
3. [ ] Verify application works with old code
4. [ ] Restore database from backup if needed
5. [ ] Notify team of rollback
6. [ ] Document reason for rollback

### Investigation
1. [ ] Review logs for root cause
2. [ ] Check encryption key validity
3. [ ] Verify database state
4. [ ] Test encryption locally
5. [ ] Fix identified issues
6. [ ] Retest in staging

## Troubleshooting

### Application Won't Start
- Check `ENCRYPTION_KEY` is set correctly
- Verify key is at least 32 characters
- Check environment variable syntax
- Review application logs

### Decryption Failures
- Verify encryption key matches
- Check if key was rotated
- Review database data integrity
- Check logs for specific errors

### Payment Processing Fails
- Test with unencrypted credentials first
- Verify gateway connection
- Check credentials are correct
- Review payment gateway logs

### Performance Issues
- Monitor database query times
- Check if encryption causing delays
- Review application metrics
- Consider caching strategies

## Success Criteria

### Deployment Success
- [ ] All payment configs encrypted
- [ ] No encryption/decryption errors
- [ ] Payment processing works normally
- [ ] No customer-facing issues
- [ ] Monitoring shows healthy metrics
- [ ] Team confirms success

### Ready for Next Environment
- [ ] All checklist items completed
- [ ] No critical issues found
- [ ] Documentation updated
- [ ] Team trained on procedures
- [ ] Runbook updated

## Emergency Contacts

Document your team contacts:

- **Security Team**: [Contact Info]
- **DevOps Lead**: [Contact Info]
- **On-Call Engineer**: [Contact Info]
- **Database Admin**: [Contact Info]
- **Payment Team**: [Contact Info]

## Documentation Links

- Quick Start: `docs/QUICK_START_ENCRYPTION.md`
- Full Documentation: `docs/PAYMENT_ENCRYPTION.md`
- Implementation Summary: `ENCRYPTION_IMPLEMENTATION.md`
- Deployment Summary: `PAYMENT_ENCRYPTION_SUMMARY.md`

---

## Sign-Off

### Development
- [ ] Deployed by: _________________ Date: _______
- [ ] Verified by: _________________ Date: _______

### Staging
- [ ] Deployed by: _________________ Date: _______
- [ ] Verified by: _________________ Date: _______
- [ ] Security Review: _____________ Date: _______

### Production
- [ ] Deployed by: _________________ Date: _______
- [ ] Verified by: _________________ Date: _______
- [ ] Security Review: _____________ Date: _______
- [ ] Team Lead Approval: __________ Date: _______

---

**Last Updated**: 2026-03-11
**Version**: 1.0
**Status**: Ready for Deployment
