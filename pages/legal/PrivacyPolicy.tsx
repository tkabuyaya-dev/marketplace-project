import React from 'react';
import { LegalHeader } from './LegalHeader';
import { LegalSection } from './LegalSection';
import { LegalWarningBox } from './LegalWarningBox';
import { LegalInfoBox } from './LegalInfoBox';

const PrivacyPolicy: React.FC = () => (
  <div className="pt-20 md:pt-24 px-4 pb-24">
    <div className="max-w-2xl mx-auto">
      <LegalHeader
        title="Politique de Confidentialité"
        subtitle="NUNULIA — Marketplace Afrique Centrale"
        badge="Version 1.0 — En vigueur au 26 mars 2026"
      />

      <LegalInfoBox>
        La protection de vos données personnelles est une priorité absolue pour NUNULIA. Cette politique explique quelles données nous collectons, pourquoi nous les traitons et quels sont vos droits.
      </LegalInfoBox>

      {/* Article 1 */}
      <LegalSection title="Article 1 — Responsable du Traitement">
        <ul className="space-y-1">
          <li>Dénomination : <strong className="text-white">NUNULIA</strong></li>
          <li>Siège : Bujumbura, Burundi</li>
          <li>Contact DPO : <span className="text-amber-400">support@nunulia.com</span></li>
          <li>Site : <span className="text-amber-400">https://nunulia.com</span></li>
        </ul>
      </LegalSection>

      {/* Article 2 */}
      <LegalSection title="Article 2 — Données Collectées">
        <p><strong className="text-white">2.1 Données fournies directement par l'utilisateur</strong></p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Nom et prénom affichés sur votre profil public</li>
          <li>Adresse email (via authentification Google)</li>
          <li>Photo de profil (optionnelle, via Google ou upload)</li>
          <li>Numéro WhatsApp (optionnel, visible sur vos annonces)</li>
          <li>Biographie ou description de boutique</li>
          <li>Informations commerciales (si compte vendeur actif)</li>
          <li>Photos de produits (hébergées via Cloudinary)</li>
        </ul>

        <p><strong className="text-white">2.2 Données collectées automatiquement</strong></p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Données de connexion (date, heure, appareil)</li>
          <li>Données de navigation dans l'application</li>
          <li>Identifiant unique Firebase (UID)</li>
          <li>Historique des annonces publiées</li>
          <li>Données d'abonnement (plan souscrit, date d'expiration)</li>
          <li>Requêtes de recherche (via Algolia, anonymisées)</li>
        </ul>

        <p><strong className="text-white">2.3 Données explicitement NON collectées</strong></p>
        <LegalInfoBox>
          NUNULIA ne collecte pas de données bancaires, de numéros de carte de crédit ni de coordonnées de paiement directes. Nous ne collectons pas de géolocalisation en temps réel ni de données biométriques d'aucune sorte.
        </LegalInfoBox>
      </LegalSection>

      {/* Article 3 */}
      <LegalSection title="Article 3 — Finalités du Traitement">
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li>Création et gestion de votre compte utilisateur</li>
          <li>Authentification sécurisée via Google OAuth</li>
          <li>Affichage de votre profil public et de vos annonces</li>
          <li>Mise en relation entre acheteurs et vendeurs</li>
          <li>Gestion des abonnements vendeur premium</li>
          <li>Envoi de notifications liées à votre activité</li>
          <li>Amélioration de l'expérience utilisateur</li>
          <li>Détection et prévention des fraudes</li>
          <li>Conformité aux obligations légales applicables</li>
          <li>Support client et communication</li>
        </ol>
      </LegalSection>

      {/* Article 4 */}
      <LegalSection title="Article 4 — Base Légale du Traitement">
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong className="text-white">Exécution du contrat :</strong> traitement nécessaire à la fourniture du service NUNULIA</li>
          <li><strong className="text-white">Consentement explicite :</strong> pour communications optionnelles</li>
          <li><strong className="text-white">Intérêt légitime :</strong> sécurité de la plateforme, prévention des fraudes, amélioration du service</li>
          <li><strong className="text-white">Obligation légale :</strong> conservation de certaines données imposée par la réglementation applicable</li>
        </ul>
      </LegalSection>

      {/* Article 5 */}
      <LegalSection title="Article 5 — Partage des Données">
        <p><strong className="text-white">5.1 Sous-traitants techniques (uniquement)</strong></p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong className="text-white">Google Firebase :</strong> base de données, hébergement, authentification</li>
          <li><strong className="text-white">Algolia :</strong> moteur de recherche interne (données anonymisées)</li>
          <li><strong className="text-white">Cloudinary :</strong> hébergement des images des annonces</li>
        </ul>

        <p><strong className="text-white">5.2 Garanties sous-traitants</strong></p>
        <p>
          Ces prestataires traitent vos données uniquement sur instruction de NUNULIA et aux fins strictement nécessaires à la fourniture de leurs services techniques.
        </p>

        <p><strong className="text-white">5.3 Engagement de non-vente</strong></p>
        <LegalWarningBox>
          NUNULIA ne vend, ne loue, ne cède et ne monétise jamais vos données personnelles à des tiers à des fins commerciales ou publicitaires. Aucun annonceur tiers n'accède à vos données via NUNULIA.
        </LegalWarningBox>
      </LegalSection>

      {/* Article 6 */}
      <LegalSection title="Article 6 — Durée de Conservation">
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong className="text-white">Compte actif :</strong> pendant toute la durée de l'inscription</li>
          <li><strong className="text-white">Après suppression du compte :</strong> anonymisation immédiate de toutes les données identifiantes</li>
          <li><strong className="text-white">Historique des transactions :</strong> 5 ans (obligations légales)</li>
          <li><strong className="text-white">Logs de sécurité et d'audit :</strong> 12 mois</li>
          <li><strong className="text-white">Données de facturation :</strong> 7 ans (obligations comptables)</li>
          <li><strong className="text-white">Photos d'annonces supprimées :</strong> effacement sous 90 jours</li>
        </ul>
      </LegalSection>

      {/* Article 7 */}
      <LegalSection title="Article 7 — Sécurité des Données">
        <p>Mesures techniques en place :</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Authentification déléguée à Google OAuth 2.0 (aucun mot de passe stocké par NUNULIA)</li>
          <li>Chiffrement en transit : HTTPS/TLS sur toutes les communications</li>
          <li>Règles Firestore strictes : accès limité selon le rôle</li>
          <li>Accès administrateur restreint et journalisé</li>
          <li>Surveillance continue des accès anormaux</li>
        </ul>
        <LegalInfoBox>
          Malgré ces mesures, aucun système informatique n'est infaillible. En cas de violation de données affectant vos droits, vous en serez informé dans les meilleurs délais conformément aux obligations légales.
        </LegalInfoBox>
      </LegalSection>

      {/* Article 8 */}
      <LegalSection title="Article 8 — Vos Droits">
        <p>Vous disposez des droits suivants sur vos données :</p>
        <ol className="list-decimal list-inside space-y-2 ml-2">
          <li><strong className="text-white">Droit d'accès</strong> — Obtenir une copie de vos données</li>
          <li><strong className="text-white">Droit de rectification</strong> — Corriger des données inexactes</li>
          <li><strong className="text-white">Droit à l'effacement</strong> — Demander la suppression du compte</li>
          <li><strong className="text-white">Droit à la portabilité</strong> — Recevoir vos données en format structuré et lisible par machine</li>
          <li><strong className="text-white">Droit d'opposition</strong> — Vous opposer à certains traitements</li>
          <li><strong className="text-white">Droit à la limitation</strong> — Suspendre temporairement un traitement</li>
        </ol>
        <p className="mt-3">
          Pour exercer ces droits : <span className="text-amber-400">support@nunulia.com</span><br />
          Délai de réponse garanti : 30 jours maximum.
        </p>

        <p><strong className="text-white">8.1 Suppression de compte — Exercice direct</strong></p>
        <p>
          Disponible directement dans Profil &rarr; Zone Dangereuse. Entraîne l'anonymisation immédiate de toutes les données identifiantes. Certaines données anonymisées peuvent être conservées pour l'intégrité et la sécurité de la plateforme.
        </p>
      </LegalSection>

      {/* Article 9 */}
      <LegalSection title="Article 9 — Cookies et Stockage Local">
        <p>NUNULIA utilise uniquement le stockage local PWA pour :</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong className="text-white">Cache PWA :</strong> fonctionnement hors ligne de l'application</li>
          <li><strong className="text-white">Préférences :</strong> langue, devise, paramètres d'affichage</li>
          <li><strong className="text-white">Cache profil :</strong> chargement accéléré des données utilisateur</li>
        </ul>
        <p className="mt-2">
          Nous n'utilisons aucun cookie de traçage publicitaire, aucun pixel de suivi tiers, aucune technologie de fingerprinting.
        </p>
      </LegalSection>

      {/* Article 10 */}
      <LegalSection title="Article 10 — Transferts Internationaux">
        <p>
          Vos données sont hébergées sur Google Firebase, région europe-west1 (Belgique, Union Européenne). Firebase dispose de mécanismes de protection adéquats (clauses contractuelles types) pour les transferts internationaux.
        </p>
      </LegalSection>

      {/* Article 11 */}
      <LegalSection title="Article 11 — Protection des Mineurs">
        <p>
          NUNULIA est strictement réservée aux personnes majeures (18 ans et plus). Nous ne collectons pas sciemment de données relatives à des mineurs. Si vous constatez qu'un mineur a créé un compte, signalez-le immédiatement à : <span className="text-amber-400">support@nunulia.com</span> — Le compte sera supprimé sans délai.
        </p>
      </LegalSection>

      {/* Article 12 */}
      <LegalSection title="Article 12 — Modifications de la Politique">
        <p>
          Toute modification substantielle sera notifiée avec un préavis de 15 jours via notification dans l'application. L'utilisation continue après modification vaut acceptation de la politique mise à jour.
        </p>
      </LegalSection>

      {/* Article 13 */}
      <LegalSection title="Article 13 — Contact et Réclamations">
        <ul className="space-y-1">
          <li>Email : <span className="text-amber-400">support@nunulia.com</span></li>
          <li>Site : <span className="text-amber-400">https://nunulia.com</span></li>
          <li>Délai de réponse : 30 jours maximum</li>
        </ul>
        <p className="mt-3">
          En cas de non-respect estimé de vos droits, vous pouvez saisir l'autorité de protection des données compétente dans votre pays de résidence.
        </p>
      </LegalSection>

      {/* Footer */}
      <div className="text-center text-xs text-gray-600 border-t border-gray-800 pt-6 mt-8">
        &copy; 2026 NUNULIA — Document officiel — Version 1.0 — 26 mars 2026 — Tous droits réservés.
      </div>
    </div>
  </div>
);

export default PrivacyPolicy;
