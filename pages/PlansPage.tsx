import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from '../components/Toast';
import {
  INITIAL_SUBSCRIPTION_TIERS, PAYMENT_METHODS, SUPPORT_WHATSAPP,
  DEFAULT_SUBSCRIPTION_PRICING, INITIAL_COUNTRIES,
} from '../constants';
import { TC } from '../constants';
import {
  SubscriptionRequest, SubscriptionTier, SubscriptionPricing, PaymentMethod,
} from '../types';
import {
  createSubscriptionRequest, confirmPayment, getMySubscriptionRequests,
  getSubscriptionPricing, getSubscriptionTiers,
} from '../services/firebase';

type Step = 'plans' | 'payment' | 'confirmation' | 'done';

export const PlansPage: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('plans');
  const [tiers, setTiers] = useState<SubscriptionTier[]>(INITIAL_SUBSCRIPTION_TIERS);
  const [pricing, setPricing] = useState<SubscriptionPricing | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionTier | null>(null);
  const [transactionRef, setTransactionRef] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [myRequests, setMyRequests] = useState<SubscriptionRequest[]>([]);

  const sellerCountryId = currentUser?.sellerDetails?.countryId || 'bi';
  const country = INITIAL_COUNTRIES.find(c => c.id === sellerCountryId);
  const paymentMethods = PAYMENT_METHODS[sellerCountryId] || PAYMENT_METHODS['bi'];
  const whatsappNumber = SUPPORT_WHATSAPP[sellerCountryId] || SUPPORT_WHATSAPP['bi'];
  const currentTierLabel = currentUser?.sellerDetails?.tierLabel || 'Gratuit';

  // Paid tiers only (exclude free)
  const paidTiers = useMemo(() => tiers.filter(t => t.id !== 'free'), [tiers]);

  useEffect(() => {
    if (!currentUser || currentUser.role === 'buyer') {
      navigate('/');
      return;
    }

    const load = async () => {
      const [fetchedTiers, fetchedPricing, requests] = await Promise.all([
        getSubscriptionTiers(),
        getSubscriptionPricing(sellerCountryId),
        getMySubscriptionRequests(currentUser.id),
      ]);
      setTiers(fetchedTiers);
      setPricing(fetchedPricing);
      setMyRequests(requests);
    };
    load();
  }, [currentUser, sellerCountryId]);

  const getPrice = (tierId: string): number => {
    if (pricing?.prices[tierId] !== undefined) return pricing.prices[tierId];
    const defaults = DEFAULT_SUBSCRIPTION_PRICING[sellerCountryId] || DEFAULT_SUBSCRIPTION_PRICING['bi'];
    return defaults.prices[tierId] || 0;
  };

  const getCurrency = (): string => {
    if (pricing?.currency) return pricing.currency;
    const defaults = DEFAULT_SUBSCRIPTION_PRICING[sellerCountryId] || DEFAULT_SUBSCRIPTION_PRICING['bi'];
    return defaults.currency;
  };

  const formatPrice = (amount: number) => {
    return amount.toLocaleString() + ' ' + getCurrency();
  };

  const getMaxProducts = (tier: SubscriptionTier): number => {
    if (tier.max === null) return 99999;
    return tier.max;
  };

  // Check if user has a pending request for this plan
  const hasPendingRequest = (planId: string) =>
    myRequests.some(r => r.planId === planId && (r.status === 'pending' || r.status === 'pending_validation'));

  const handleSelectPlan = (tier: SubscriptionTier) => {
    if (hasPendingRequest(tier.id)) {
      toast('Vous avez deja une demande en cours pour ce plan.', 'error');
      return;
    }
    setSelectedPlan(tier);
    setStep('payment');
  };

  const handleCreateRequest = async () => {
    if (!currentUser || !selectedPlan) return;
    setLoading(true);
    try {
      const requestId = await createSubscriptionRequest({
        userId: currentUser.id,
        sellerName: currentUser.sellerDetails?.shopName || currentUser.name,
        countryId: sellerCountryId,
        planId: selectedPlan.id,
        planLabel: selectedPlan.label,
        amount: getPrice(selectedPlan.id),
        currency: getCurrency(),
        status: 'pending',
        transactionRef: null,
        proofUrl: null,
        maxProducts: getMaxProducts(selectedPlan),
      });
      setCurrentRequestId(requestId);
      setStep('confirmation');
      toast('Demande creee ! Confirmez votre paiement.', 'success');
    } catch (err) {
      toast('Erreur lors de la creation de la demande.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!currentRequestId || !transactionRef.trim()) {
      toast('Entrez la reference de transaction.', 'error');
      return;
    }
    setLoading(true);
    try {
      await confirmPayment(currentRequestId, transactionRef.trim());
      setStep('done');
      toast('Paiement confirme ! L\'admin va valider sous peu.', 'success');
    } catch (err) {
      toast('Erreur lors de la confirmation.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const whatsappMessage = selectedPlan
    ? `Bonjour, je souhaite souscrire au plan ${selectedPlan.label} sur AuraBuja.%0APays: ${country?.name || sellerCountryId}%0AMontant: ${formatPrice(getPrice(selectedPlan.id))}%0ANom: ${currentUser?.sellerDetails?.shopName || currentUser?.name}`
    : `Bonjour, je souhaite souscrire a un plan AuraBuja.`;

  if (!currentUser) return null;

  // ─── RENDER ───

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-gray-900 via-gold-950 to-gray-900 border-b border-gold-400/20">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <button onClick={() => step === 'plans' ? navigate('/dashboard') : setStep('plans')} className="text-gold-400 text-sm mb-4 hover:underline">
            &larr; {step === 'plans' ? 'Retour au dashboard' : 'Retour aux plans'}
          </button>
          <h1 className="text-3xl font-black">
            {step === 'plans' && 'Choisissez votre plan'}
            {step === 'payment' && `Paiement — ${selectedPlan?.label}`}
            {step === 'confirmation' && 'Confirmez votre paiement'}
            {step === 'done' && 'Demande envoyee !'}
          </h1>
          <p className="text-gray-400 mt-2">
            {step === 'plans' && `Plan actuel : ${currentTierLabel} | Pays : ${country?.flag} ${country?.name}`}
            {step === 'payment' && `Montant : ${selectedPlan ? formatPrice(getPrice(selectedPlan.id)) : ''} / 30 jours`}
            {step === 'confirmation' && 'Entrez la reference de votre transaction pour que l\'admin puisse verifier.'}
            {step === 'done' && 'Votre demande sera traitee dans les plus brefs delais.'}
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* ─── STEP 1: Plan Selection ─── */}
        {step === 'plans' && (
          <div className="space-y-6">
            {/* Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {paidTiers.map((tier) => {
                const price = getPrice(tier.id);
                const isCurrentPlan = currentTierLabel === tier.label;
                const isPending = hasPendingRequest(tier.id);
                const isPopular = tier.id === 'pro';

                return (
                  <div
                    key={tier.id}
                    className={`relative bg-gray-900 border rounded-2xl p-6 flex flex-col transition-all hover:scale-[1.02] ${
                      isPopular ? 'border-gold-400 shadow-lg shadow-gold-400/20' : 'border-gray-700/50 hover:border-gray-600'
                    } ${isCurrentPlan ? 'ring-2 ring-green-500/50' : ''}`}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold-400 text-gray-900 text-xs font-black px-3 py-1 rounded-full">
                        POPULAIRE
                      </div>
                    )}

                    {isCurrentPlan && (
                      <div className="absolute -top-3 right-4 bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        ACTUEL
                      </div>
                    )}

                    <h3 className="text-lg font-black text-white mb-1">{tier.label}</h3>
                    <p className="text-gray-400 text-xs mb-4">
                      {tier.max === null ? '51+ produits' : `${tier.min}-${tier.max} produits`}
                    </p>

                    <div className="mb-4">
                      <span className="text-3xl font-black text-gold-400">{price.toLocaleString()}</span>
                      <span className="text-gray-400 text-sm ml-1">{getCurrency()}/mois</span>
                    </div>

                    <ul className="space-y-2 mb-6 flex-1 text-sm text-gray-300">
                      <li className="flex items-center gap-2">
                        <span className="text-green-400">&#10003;</span>
                        {tier.max === null ? 'Produits illimites' : `Jusqu'a ${tier.max} produits`}
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-green-400">&#10003;</span>
                        Boutique verifiee
                      </li>
                      {tier.id === 'pro' && (
                        <li className="flex items-center gap-2">
                          <span className="text-green-400">&#10003;</span>
                          Badge Pro visible
                        </li>
                      )}
                      {(tier.id === 'elite' || tier.id === 'unlimited') && (
                        <>
                          <li className="flex items-center gap-2">
                            <span className="text-green-400">&#10003;</span>
                            Priorite dans les recherches
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="text-green-400">&#10003;</span>
                            Support prioritaire
                          </li>
                        </>
                      )}
                      {tier.requiresNif && (
                        <li className="flex items-center gap-2 text-yellow-400 text-xs">
                          NIF requis
                        </li>
                      )}
                    </ul>

                    {isPending ? (
                      <button disabled className="w-full py-2.5 bg-yellow-600/20 text-yellow-400 text-sm font-bold rounded-xl border border-yellow-600/30">
                        Demande en cours...
                      </button>
                    ) : isCurrentPlan ? (
                      <button disabled className="w-full py-2.5 bg-green-600/20 text-green-400 text-sm font-bold rounded-xl border border-green-600/30">
                        Plan actuel
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSelectPlan(tier)}
                        className={`w-full py-2.5 text-sm font-bold rounded-xl transition-all ${
                          isPopular
                            ? 'bg-gold-400 text-gray-900 hover:bg-gold-300'
                            : 'bg-white/10 text-white border border-white/20 hover:bg-white/20'
                        }`}
                      >
                        Choisir ce plan
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pending Requests */}
            {myRequests.filter(r => r.status !== 'approved' && r.status !== 'rejected').length > 0 && (
              <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4">
                <h3 className="text-sm font-bold text-yellow-400 mb-3">Demandes en cours</h3>
                <div className="space-y-2">
                  {myRequests.filter(r => r.status !== 'approved' && r.status !== 'rejected').map(req => (
                    <div key={req.id} className="flex items-center justify-between bg-black/20 rounded-lg px-4 py-2 text-sm">
                      <div>
                        <span className="text-white font-bold">{req.planLabel}</span>
                        <span className="text-gray-400 ml-2">{req.amount.toLocaleString()} {req.currency}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        req.status === 'pending' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {req.status === 'pending' ? 'En attente de paiement' : 'Paiement en verification'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* WhatsApp Fallback */}
            <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-sm mb-2">Besoin d'aide pour choisir ?</p>
              <a
                href={`https://wa.me/${whatsappNumber.replace('+', '')}?text=${whatsappMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-500 transition-colors"
              >
                Contactez-nous sur WhatsApp
              </a>
            </div>
          </div>
        )}

        {/* ─── STEP 2: Payment Instructions ─── */}
        {step === 'payment' && selectedPlan && (
          <div className="max-w-lg mx-auto space-y-6">
            {/* Selected Plan Summary */}
            <div className="bg-gray-900 border border-gold-400/30 rounded-xl p-5">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedPlan.label}</h3>
                  <p className="text-gray-400 text-sm">
                    {selectedPlan.max === null ? 'Produits illimites' : `${selectedPlan.max} produits max`} | 30 jours
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-gold-400">{formatPrice(getPrice(selectedPlan.id))}</p>
                </div>
              </div>
            </div>

            {/* Payment Methods */}
            <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-5">
              <h3 className="text-sm font-bold text-white mb-4">
                Payez via l'une de ces methodes ({country?.flag} {country?.name})
              </h3>
              <div className="space-y-3">
                {paymentMethods.map((method, i) => (
                  <div key={i} className="flex items-center gap-3 bg-black/30 rounded-lg px-4 py-3">
                    <span className="text-xl">{method.icon}</span>
                    <div className="flex-1">
                      <p className="text-white font-bold text-sm">{method.name}</p>
                      <p className="text-gold-400 text-xs font-mono">{method.number}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 bg-blue-900/20 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300">
                <p className="font-bold mb-1">Instructions :</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Envoyez <strong>{formatPrice(getPrice(selectedPlan.id))}</strong> via l'une des methodes ci-dessus</li>
                  <li>Notez la <strong>reference de transaction</strong> fournie</li>
                  <li>Cliquez sur "J'ai paye" ci-dessous</li>
                </ol>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleCreateRequest}
                disabled={loading}
                className="flex-1 py-3 bg-gold-400 text-gray-900 font-bold rounded-xl hover:bg-gold-300 transition-colors disabled:opacity-50"
              >
                {loading ? 'Creation...' : "J'ai paye — Creer ma demande"}
              </button>
            </div>

            <div className="text-center">
              <a
                href={`https://wa.me/${whatsappNumber.replace('+', '')}?text=${whatsappMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-400 text-sm hover:underline"
              >
                Besoin d'aide ? WhatsApp
              </a>
            </div>
          </div>
        )}

        {/* ─── STEP 3: Confirm Transaction Ref ─── */}
        {step === 'confirmation' && (
          <div className="max-w-lg mx-auto space-y-6">
            <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-5">
              <h3 className="text-sm font-bold text-white mb-4">Reference de transaction</h3>
              <input
                type="text"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder="Ex: TXN123456789 ou code Lumicash"
                className="w-full px-4 py-3 bg-black/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 focus:outline-none"
              />
              <p className="text-gray-500 text-xs mt-2">
                Entrez le code de confirmation que vous avez recu apres le paiement.
              </p>
            </div>

            <button
              onClick={handleConfirmPayment}
              disabled={loading || !transactionRef.trim()}
              className="w-full py-3 bg-gold-400 text-gray-900 font-bold rounded-xl hover:bg-gold-300 transition-colors disabled:opacity-50"
            >
              {loading ? 'Envoi...' : 'Confirmer le paiement'}
            </button>

            <p className="text-center text-gray-500 text-xs">
              Vous n'avez pas encore paye ?{' '}
              <button onClick={() => setStep('payment')} className="text-gold-400 hover:underline">
                Voir les instructions de paiement
              </button>
            </p>
          </div>
        )}

        {/* ─── STEP 4: Done ─── */}
        {step === 'done' && (
          <div className="max-w-lg mx-auto text-center space-y-6">
            <div className="bg-green-900/20 border border-green-500/30 rounded-2xl p-8">
              <div className="text-5xl mb-4">&#9989;</div>
              <h2 className="text-xl font-black text-white mb-2">Demande envoyee avec succes !</h2>
              <p className="text-gray-400">
                L'admin va verifier votre paiement et activer votre plan{' '}
                <strong className="text-gold-400">{selectedPlan?.label}</strong> sous peu.
              </p>
              <p className="text-gray-500 text-sm mt-3">
                Vous recevrez une notification une fois votre abonnement active.
              </p>
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate('/dashboard')}
                className="px-6 py-2.5 bg-white/10 text-white font-bold rounded-xl border border-white/20 hover:bg-white/20"
              >
                Retour au dashboard
              </button>
              <a
                href={`https://wa.me/${whatsappNumber.replace('+', '')}?text=Bonjour, j'ai soumis une demande d'abonnement ${selectedPlan?.label} sur AuraBuja. Ref: ${transactionRef}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-2.5 bg-green-600 text-white font-bold rounded-xl hover:bg-green-500"
              >
                Contacter via WhatsApp
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlansPage;
