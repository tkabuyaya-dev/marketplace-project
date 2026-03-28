import React from 'react';
import { LegalHeader } from './LegalHeader';
import { LegalSection } from './LegalSection';
import { LegalWarningBox } from './LegalWarningBox';
import { LegalInfoBox } from './LegalInfoBox';

const CGU: React.FC = () => (
  <div className="pt-20 md:pt-24 px-4 pb-24">
    <div className="max-w-2xl mx-auto">
      <LegalHeader
        title="Conditions Générales d'Utilisation"
        subtitle="NUNULIA — Marketplace Afrique Centrale"
        badge="Version 1.0 — En vigueur au 26 mars 2026"
      />

      <LegalInfoBox>
        Ces Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de la plateforme NUNULIA. En créant un compte ou en utilisant nos services, vous acceptez sans réserve l'intégralité des présentes CGU.
      </LegalInfoBox>

      {/* Article 1 */}
      <LegalSection title="Article 1 — Présentation de la Plateforme">
        <p><strong className="text-white">1.1 Nature du service</strong></p>
        <p>
          NUNULIA est une plateforme numérique de mise en relation entre vendeurs et acheteurs, accessible via une application web progressive (PWA) et ultérieurement via les stores mobiles. La plateforme opère principalement en Afrique centrale et subsaharienne, incluant notamment le Burundi, la République Démocratique du Congo, le Rwanda, la Tanzanie, l'Ouganda et les pays voisins.
        </p>

        <p><strong className="text-white">1.2 Rôle de la plateforme — Principe fondamental</strong></p>
        <LegalWarningBox>
          CLAUSE IMPORTANTE : NUNULIA agit exclusivement en qualité d'intermédiaire technique de mise en relation. NUNULIA n'est ni vendeur, ni acheteur, ni partie à aucune transaction conclue entre ses utilisateurs. NUNULIA ne stocke, ne manipule, ni ne transfère aucune marchandise.
        </LegalWarningBox>
        <p>En conséquence, NUNULIA décline toute responsabilité concernant :</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>La qualité, la conformité, la sécurité ou la légalité des produits ou services proposés</li>
          <li>L'exactitude des descriptions, photos ou informations publiées par les vendeurs</li>
          <li>L'exécution ou la non-exécution des transactions</li>
          <li>Tout litige, dommage ou perte financière résultant d'une transaction</li>
          <li>La solvabilité, la bonne foi ou l'identité réelle des utilisateurs</li>
          <li>Toute fraude ou comportement malveillant d'un tiers</li>
        </ul>

        <p><strong className="text-white">1.3 Avertissement aux acheteurs</strong></p>
        <LegalWarningBox>
          MISE EN GARDE EXPLICITE : Avant tout achat, l'acheteur est seul responsable de vérifier la crédibilité du vendeur, la qualité du produit et les modalités de livraison. Il est fortement déconseillé d'envoyer de l'argent avant d'avoir reçu et vérifié les marchandises. NUNULIA ne garantit aucun remboursement en cas de fraude ou de litige entre utilisateurs.
        </LegalWarningBox>
      </LegalSection>

      {/* Article 2 */}
      <LegalSection title="Article 2 — Inscription et Comptes Utilisateurs">
        <p><strong className="text-white">2.1 Conditions d'inscription</strong></p>
        <p>Pour créer un compte sur NUNULIA, vous devez :</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Être âgé d'au moins 18 ans</li>
          <li>Disposer d'un compte Google valide</li>
          <li>Fournir des informations exactes et à jour</li>
          <li>Accepter les présentes CGU et la Politique de Confidentialité</li>
          <li>Ne pas avoir été préalablement banni de la plateforme</li>
        </ul>

        <p><strong className="text-white">2.2 Responsabilité du compte</strong></p>
        <p>
          Chaque utilisateur est seul responsable de la sécurité de son compte. Toute activité effectuée depuis votre compte vous est imputable. En cas de compromission, contactez-nous immédiatement : support@nunulia.com
        </p>

        <p><strong className="text-white">2.3 Un compte par personne</strong></p>
        <p>
          La création de comptes multiples à des fins de contournement des règles est strictement interdite et entraîne la suspension immédiate de tous les comptes concernés.
        </p>
      </LegalSection>

      {/* Article 3 */}
      <LegalSection title="Article 3 — Obligations des Vendeurs">
        <p><strong className="text-white">3.1 Conformité légale — Obligation absolue</strong></p>
        <LegalInfoBox>
          Chaque vendeur opère sous sa propre responsabilité et doit se conformer à l'ensemble des lois et réglementations applicables dans son pays de résidence et dans les pays vers lesquels il expédie des marchandises.
        </LegalInfoBox>
        <p>Le vendeur est notamment tenu de :</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Détenir toutes les licences et autorisations légales requises pour exercer son activité commerciale</li>
          <li>Respecter les lois fiscales de son pays</li>
          <li>Se conformer aux réglementations douanières applicables</li>
          <li>Respecter les droits des consommateurs selon sa législation nationale</li>
          <li>Ne proposer que des produits légalement autorisés</li>
        </ul>

        <p><strong className="text-white">3.2 Produits strictement interdits</strong></p>
        <p>Il est formellement interdit de mettre en vente :</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Des produits contrefaits, volés ou illicites</li>
          <li>Des substances contrôlées ou médicaments sans autorisation</li>
          <li>Des armes, munitions ou matériaux dangereux</li>
          <li>Du contenu illégal, offensant ou haineux</li>
          <li>Des animaux ou espèces protégées</li>
          <li>Tout produit prohibé dans le pays du vendeur ou acheteur</li>
          <li>Des services financiers non régulés ou pyramidaux</li>
        </ul>

        <p><strong className="text-white">3.3 Exactitude des informations</strong></p>
        <p>
          Le vendeur s'engage à publier des informations exactes concernant ses produits. Toute fausse déclaration engage exclusivement sa responsabilité personnelle et peut entraîner la suspension immédiate du compte.
        </p>

        <p><strong className="text-white">3.4 Contact et réactivité</strong></p>
        <p>
          Le vendeur s'engage à répondre aux demandes via WhatsApp dans un délai raisonnable. Un vendeur inactif depuis plus de 90 jours peut voir ses annonces suspendues d'office.
        </p>
      </LegalSection>

      {/* Article 4 */}
      <LegalSection title="Article 4 — Obligations des Acheteurs">
        <p><strong className="text-white">4.1 Prudence et diligence</strong></p>
        <p>L'acheteur s'engage à :</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Vérifier l'identité et la réputation du vendeur</li>
          <li>Ne jamais envoyer d'argent avant réception des marchandises</li>
          <li>Utiliser des moyens de paiement sécurisés et traçables</li>
          <li>Conserver toute preuve de communication</li>
          <li>Signaler tout comportement suspect à NUNULIA</li>
        </ul>

        <p><strong className="text-white">4.2 Responsabilité de l'acheteur</strong></p>
        <p>
          L'acheteur est seul responsable de ses décisions d'achat. NUNULIA ne pourra être tenu responsable de toute perte financière résultant d'une transaction entre utilisateurs.
        </p>
      </LegalSection>

      {/* Article 5 */}
      <LegalSection title="Article 5 — Abonnements et Paiements">
        <p><strong className="text-white">5.1 Plans d'abonnement</strong></p>
        <p>
          Certaines fonctionnalités vendeur sont accessibles sur abonnement payant selon les plans affichés dans l'application.
        </p>

        <p><strong className="text-white">5.2 Facturation</strong></p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Les abonnements sont facturés en avance</li>
          <li>L'abonnement prend effet dès validation du paiement</li>
          <li>Pas de renouvellement automatique sans action utilisateur</li>
          <li>Tarifs modifiables avec préavis de 30 jours</li>
        </ul>

        <p><strong className="text-white">5.3 Politique de non-remboursement</strong></p>
        <LegalWarningBox>
          IMPORTANT : Les abonnements sont non remboursables. En cas de résiliation anticipée ou de suppression du compte, aucun remboursement ne sera effectué pour la période restante. L'accès premium reste actif jusqu'à la date d'expiration initialement prévue.
        </LegalWarningBox>

        <p><strong className="text-white">5.4 Résiliation</strong></p>
        <p>
          L'utilisateur peut résilier depuis les paramètres de son compte. La résiliation prend effet à la fin de la période en cours.
        </p>
      </LegalSection>

      {/* Article 6 */}
      <LegalSection title="Article 6 — Propriété Intellectuelle">
        <p>
          La plateforme NUNULIA, son interface, son logo, sa marque et ses fonctionnalités sont protégés par les droits de propriété intellectuelle. En publiant du contenu, l'utilisateur accorde à NUNULIA une licence non exclusive d'utilisation limitée à la durée de l'annonce, tout en conservant la pleine propriété de son contenu.
        </p>
      </LegalSection>

      {/* Article 7 */}
      <LegalSection title="Article 7 — Suspension et Résiliation">
        <p><strong className="text-white">7.1 Motifs de suspension</strong></p>
        <p>NUNULIA peut suspendre ou supprimer tout compte en cas de :</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Violation des présentes CGU</li>
          <li>Publication de contenus illégaux ou frauduleux</li>
          <li>Comportement abusif envers d'autres utilisateurs</li>
          <li>Utilisation à des fins illicites</li>
          <li>Inactivité de plus de 12 mois consécutifs</li>
        </ul>

        <p><strong className="text-white">7.2 Suppression volontaire</strong></p>
        <p>
          Tout utilisateur peut supprimer son compte depuis Profil &rarr; Zone Dangereuse. Cette action entraîne l'anonymisation immédiate des données personnelles et la désactivation définitive de toutes les annonces. Elle est irréversible.
        </p>
      </LegalSection>

      {/* Article 8 */}
      <LegalSection title="Article 8 — Limitation de Responsabilité">
        <LegalWarningBox>
          CLAUSE DE NON-RESPONSABILITÉ : Dans les limites permises par la loi, NUNULIA ne saurait être tenu responsable de tout dommage résultant de l'utilisation de la plateforme, d'une transaction entre utilisateurs, d'une indisponibilité du service ou d'un accès non autorisé à un compte.
        </LegalWarningBox>
        <p>
          La plateforme est fournie «&nbsp;en l'état&nbsp;». NUNULIA ne garantit pas une disponibilité ininterrompue et se réserve le droit de suspendre temporairement l'accès pour maintenance.
        </p>
      </LegalSection>

      {/* Article 9 */}
      <LegalSection title="Article 9 — Droit Applicable et Litiges">
        <p><strong className="text-white">9.1 Droit applicable</strong></p>
        <p>
          Les présentes CGU sont régies par le droit burundais, sans préjudice des droits des utilisateurs d'autres pays selon leur législation nationale.
        </p>

        <p><strong className="text-white">9.2 Responsabilité transfrontalière</strong></p>
        <p>
          Chaque utilisateur situé dans un pays autre que le Burundi est personnellement responsable du respect des lois locales applicables à son activité sur NUNULIA.
        </p>

        <p><strong className="text-white">9.3 Résolution des litiges</strong></p>
        <p>
          En cas de litige, les parties rechercheront d'abord une solution amiable. À défaut, les tribunaux compétents de Bujumbura, République du Burundi, seront saisis.
        </p>
      </LegalSection>

      {/* Article 10 */}
      <LegalSection title="Article 10 — Modifications des CGU">
        <p>
          NUNULIA peut modifier ces CGU à tout moment. Les utilisateurs connectés seront informés avec un préavis de 15 jours via notification dans l'application. L'utilisation continue vaut acceptation des nouvelles CGU.
        </p>
      </LegalSection>

      {/* Article 11 */}
      <LegalSection title="Article 11 — Contact">
        <ul className="space-y-1">
          <li>Email : <span className="text-amber-400">support@nunulia.com</span></li>
          <li>Site web : <span className="text-amber-400">https://nunulia.com</span></li>
          <li>Adresse : Bujumbura, Burundi</li>
        </ul>
      </LegalSection>

      {/* Footer */}
      <div className="text-center text-xs text-gray-600 border-t border-gray-800 pt-6 mt-8">
        &copy; 2026 NUNULIA — Document officiel — Version 1.0 — 26 mars 2026 — Tous droits réservés.
      </div>
    </div>
  </div>
);

export default CGU;
