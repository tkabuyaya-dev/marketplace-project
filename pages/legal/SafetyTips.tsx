import React from 'react';
import { LegalHeader } from './LegalHeader';
import { LegalSection } from './LegalSection';
import { LegalWarningBox } from './LegalWarningBox';
import { LegalInfoBox } from './LegalInfoBox';

const SafetyTips: React.FC = () => (
  <div className="pt-20 md:pt-24 px-4 pb-24">
    <div className="max-w-2xl mx-auto">
      <LegalHeader
        title="Conseils de Sécurité"
        subtitle="Acheter et vendre en toute confiance sur NUNULIA"
        badge="Lecture recommandée avant tout achat"
      />

      <LegalInfoBox>
        NUNULIA met en relation acheteurs et vendeurs, mais ne participe pas aux paiements entre eux. Les transactions se font directement de personne à personne. Voici comment vous protéger.
      </LegalInfoBox>

      <LegalSection title="Avant d'acheter — vérifier le vendeur">
        <ul className="list-disc list-inside space-y-2 ml-2">
          <li>Repérez le badge <strong className="text-white">vendeur vérifié</strong> sur le profil. Un vendeur non vérifié n'est pas forcément frauduleux, mais vous devez redoubler de prudence.</li>
          <li>Consultez la <strong className="text-white">note vendeur</strong>, le nombre de produits publiés et la date d'inscription.</li>
          <li>Privilégiez les vendeurs avec une <strong className="text-white">boutique active</strong> depuis plusieurs semaines.</li>
          <li>Lisez attentivement la description du produit et regardez toutes les photos.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Communication — passer par WhatsApp">
        <p>Utilisez le bouton <strong className="text-white">Contacter</strong> directement depuis la fiche produit. Cela ouvre WhatsApp avec le bon numéro.</p>
        <ul className="list-disc list-inside space-y-2 ml-2">
          <li>Demandez des <strong className="text-white">photos supplémentaires</strong> et une vidéo du produit en main.</li>
          <li>Posez vos questions sur l'état, la garantie, la livraison.</li>
          <li>Méfiez-vous d'un vendeur qui refuse d'envoyer des preuves ou qui change de numéro.</li>
        </ul>
        <LegalWarningBox>
          Ne communiquez jamais votre code PIN Mobile Money, ni un code de confirmation reçu par SMS. Aucun vendeur honnête ni NUNULIA ne vous le demandera.
        </LegalWarningBox>
      </LegalSection>

      <LegalSection title="Paiement Mobile Money — bonnes pratiques">
        <ul className="list-disc list-inside space-y-2 ml-2">
          <li>Vérifiez le <strong className="text-white">nom du destinataire</strong> avant de valider la transaction (il doit correspondre au vendeur).</li>
          <li>Conservez la <strong className="text-white">référence de transaction</strong> (SMS de confirmation) jusqu'à la livraison du produit.</li>
          <li>Pour les montants importants, privilégiez le <strong className="text-white">paiement à la livraison</strong> ou un rendez-vous physique.</li>
          <li>Refusez tout paiement vers un numéro différent de celui affiché sur NUNULIA.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Rendez-vous physique — pour les achats locaux">
        <ul className="list-disc list-inside space-y-2 ml-2">
          <li>Rencontrez-vous dans un <strong className="text-white">lieu public</strong> et fréquenté (centre commercial, station essence, café).</li>
          <li>Évitez les rendez-vous en soirée ou dans des lieux isolés.</li>
          <li>Venez accompagné si possible, surtout pour les transactions importantes.</li>
          <li>Inspectez le produit en détail avant de remettre l'argent.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Signes d'une possible arnaque">
        <ul className="list-disc list-inside space-y-2 ml-2">
          <li>Le prix est <strong className="text-white">anormalement bas</strong> par rapport au marché.</li>
          <li>Le vendeur insiste pour un <strong className="text-white">paiement immédiat</strong> sans laisser le temps de réfléchir.</li>
          <li>Le vendeur refuse de montrer le produit en vidéo ou de se déplacer.</li>
          <li>Les photos du produit semblent copiées d'Internet (vérifiez avec une recherche d'image).</li>
          <li>Le compte est <strong className="text-white">tout récent</strong> et n'a aucun avis.</li>
          <li>Le vendeur demande un acompte ou un paiement par lien externe.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Vous êtes vendeur — protégez-vous aussi">
        <ul className="list-disc list-inside space-y-2 ml-2">
          <li>Ne livrez jamais un produit avant d'avoir <strong className="text-white">vérifié la réception</strong> du paiement Mobile Money sur votre compte.</li>
          <li>Méfiez-vous des fausses captures d'écran de paiement — confirmez toujours via votre application Mobile Money.</li>
          <li>Refusez les chèques, virements depuis l'étranger ou paiements en plusieurs fois sans garantie.</li>
          <li>Pour les remises en main propre, choisissez aussi un lieu public.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Signaler un problème">
        <p>
          En cas d'arnaque, de fraude ou de comportement suspect, contactez immédiatement notre équipe :
        </p>
        <ul className="list-disc list-inside space-y-2 ml-2">
          <li>Email : <span className="text-amber-400">support@nunulia.com</span></li>
          <li>WhatsApp : via le bouton de support de l'application</li>
        </ul>
        <p>Conservez toutes les preuves (captures d'écran, références de transaction, échanges WhatsApp). Plus votre signalement est précis, plus nous pourrons agir vite.</p>
      </LegalSection>

      <LegalInfoBox>
        NUNULIA modère les comptes et peut suspendre un vendeur signalé. Mais nous ne pouvons pas remonter vos paiements à votre place — c'est pourquoi la prévention reste votre meilleure protection.
      </LegalInfoBox>
    </div>
  </div>
);

export default SafetyTips;
