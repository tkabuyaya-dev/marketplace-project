# Réseau B2B Nunulia

Un réseau d'échange entre vendeurs Pro / Grossiste de la marketplace, conçu pour le commerce inter-régional du Burundi, de la RDC, du Rwanda, de la Tanzanie, du Kenya et de l'Ouganda. Quatre catégories : **Fournisseur**, **Revendeur**, **Signal marché**, **Transport**. Tous les posts sont traduits automatiquement en cinq langues (FR / EN / SW / RN / RW) par Claude Haiku 4.5 côté serveur, et chaque vendeur lit le feed dans sa langue préférée.

---

## Page d'entrée

- Route : `/reseau`
- Composant page : [pages/B2B.tsx](pages/B2B.tsx)
- Onglet Navbar : visible pour `role=seller` et `role=admin` ; les Gratuit/Vendeur voient le feed mais avec un overlay de conversion vers `/plans`.

## Modèle d'accès

Source de vérité : [hooks/useB2BAccess.ts](hooks/useB2BAccess.ts).

| Plan | canView | canInteract | canPublish |
| --- | --- | --- | --- |
| Gratuit | ✅ (flouté) | ❌ | ❌ |
| Vendeur | ✅ (flouté) | ❌ | ❌ |
| Pro | ✅ | ✅ | ✅ |
| Grossiste | ✅ | ✅ | ✅ |

Le tier est lu depuis `currentUser.sellerDetails.tierLabel`. Le JWT custom claim n'a volontairement **pas** été modifié pour rester aligné sur la guardrail sécurité du projet.

## Données Firestore

### Collections

| Collection | Description |
| --- | --- |
| `b2b_posts/{postId}` | Posts visibles dans le feed. |
| `b2b_helps/{postId_helperId}` | Un "Je peux aider" — id déterministe = unicité native. |
| `b2b_confirmations/{postId_confirmerId}` | Une confirmation "signal valide". |
| `b2bTranslationCache/{hash}` | Cache des traductions par hash du texte source. |

### Champs ajoutés sur `users/{uid}`

- `b2bLang` : `'fr' \| 'en' \| 'sw' \| 'rn' \| 'rw'` — préférence de lecture du feed.
- `b2bReputation` : `number` — admin-only writable (modifié par les CFs).

### Index

7 nouveaux index composites dans [firestore.indexes.json](firestore.indexes.json) (feed, fermeture cron, helps par post, helps par helper, confirmations par post).

## Règles Firestore — ce qui est verrouillé côté serveur

- Helper `canInteractB2B()` : lit `tierLabel` + `subscriptionExpiresAt` côté Firestore (même pattern que `canCreateProduct`).
- `b2b_helps` : id forcé = `${postId}_${request.auth.uid}` → un seul help possible par post, garanti par la rule native (pas de race).
- `b2b_confirmations` : même garde-fou d'id déterministe.
- `helpCount`, `confirmCount`, `translations`, `isVerified` : tous écrits exclusivement par les CFs admin SDK (bypass des rules).

## Cloud Functions

Toutes en `europe-west1`, alignées sur l'architecture FCM existante (un doc dans `notifications/{id}` → push via `onNotificationCreate`).

| Function | Trigger | Effet |
| --- | --- | --- |
| `translateB2BPost` | `onCreate b2b_posts` | Claude Haiku 4.5 traduit l'`originalText` dans les 4 langues cibles. Cache hash. ~$0.0006 par appel sans cache. |
| `onB2bHelp` | `onCreate b2b_helps` | `helpCount += 1` (FieldValue.increment) + notif "X peut vous aider" à l'auteur + `b2bReputation += 1` au helper. |
| `onB2bConfirmation` | `onCreate b2b_confirmations` | Transaction : ajoute la ville à `uniqueCitiesConfirmed` si absente, incrémente `confirmCount`. À 3 villes différentes → `isVerified = true` + notif "Signal Validé". |
| `closeExpiredB2BPosts` | Cron `30 6 * * *` UTC | Ferme les posts open dont `expiresAt < now` (TTL 30 j) + `b2bReputation += 2` à chaque auteur unique. |

Les exports sont déclarés dans [functions/src/index.ts](functions/src/index.ts).

## Secrets requis

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
```

Déjà présent dans le projet (réutilisé par `generate-product-description` et `notify-buyer-request-match`).

## Composants front

| Fichier | Rôle |
| --- | --- |
| [components/B2B/B2BTab.tsx](components/B2B/B2BTab.tsx) | Conteneur principal : chips, feed paginé cursor-based, FAB Publier. Applique `data-b2b="true"` qui scope les CSS variables dark. |
| [components/B2B/B2BPostCard.tsx](components/B2B/B2BPostCard.tsx) | Carte d'un post. Affiche `translations[userLang]` ?? `originalText`. Bouton "Je peux aider" héros (gold + pulse), bouton WhatsApp pré-rempli, bouton Confirmer. Lien vidéo/réseau optionnel (`mediaUrl`) re-validé à l'affichage et ouvert en nouvel onglet (`noopener`). Pour les non-Pro : contenu flouté + overlay. |
| [components/B2B/B2BPublishForm.tsx](components/B2B/B2BPublishForm.tsx) | Formulaire 2 étapes (saisie + preview) avec détection heuristique de la langue source. Champ `mediaUrl` optionnel avec détection live de la plateforme. |

### Lien vidéo / réseau (`mediaUrl`)

Champ **optionnel** sur `b2b_posts`. Whitelist STRICTE — TikTok / Facebook / Instagram / YouTube uniquement, en `https`. Source unique : [utils/socialLinks.ts](utils/socialLinks.ts), rejouée côté rules via `validSocialUrl()`. But sécurité : empêcher le champ de servir de canal de contournement du masquage WhatsApp. Aucun embed (offline-first) — simple lien ouvert en nouvel onglet.
| [components/B2B/B2BHelpList.tsx](components/B2B/B2BHelpList.tsx) | Liste des helpers d'un post — visible uniquement par l'auteur (filtrage côté rules). |
| [components/B2B/B2BCategoryChips.tsx](components/B2B/B2BCategoryChips.tsx) | Filtre horizontal avec compteurs live (one-shot). |
| [components/B2B/B2BReputationRings.tsx](components/B2B/B2BReputationRings.tsx) | Anneaux SVG concentriques selon le score. |
| [components/B2B/B2BUpsellOverlay.tsx](components/B2B/B2BUpsellOverlay.tsx) | Bannière + overlay de conversion vers `/plans`. |
| [components/B2B/B2BLanguageMenuItem.tsx](components/B2B/B2BLanguageMenuItem.tsx) | Entrée "Langue du Réseau B2B" sous Profile → Préférences. |
| [components/B2B/b2b.css](components/B2B/b2b.css) | Tokens CSS scopés `[data-b2b="true"]`. Palette dark dédiée sans toucher au thème global. |

## Hooks

- [hooks/useB2BAccess.ts](hooks/useB2BAccess.ts) — accès dérivé du tier.
- [hooks/useUserLanguage.ts](hooks/useUserLanguage.ts) — lecture / écriture de `b2bLang`.

## i18n

Les clés vivent dans le `common.json` existant (mono-namespace) sous `b2b.*` et `nav.b2b`. Les contenus des **posts** sont traduits en 5 langues côté serveur ; l'UI reste FR + EN (aligné sur la décision projet).

## Comment tester localement

1. Déployer rules + index : `firebase deploy --only firestore:rules,firestore:indexes`.
2. Déployer les CFs : `firebase deploy --only functions:translateB2BPost,functions:onB2bHelp,functions:onB2bConfirmation,functions:closeExpiredB2BPosts`.
3. Se connecter avec un compte vendeur **Pro** ou **Grossiste** non suspendu.
4. Aller sur `/reseau`.
5. Publier un post (catégorie + texte 5-280 chars).
6. Vérifier dans le panneau Firestore que `translationStatus` passe à `done` sous 1-3 s.
7. Avec un second compte vendeur Pro, cliquer "Je peux aider" → vérifier que `helpCount` s'incrémente et que le premier compte reçoit la notif push.
8. Tester l'overlay floutée en se reconnectant avec un compte Gratuit.

## Points de vigilance

- **Si Claude tombe** : `translationStatus='failed'`, le post est servi en langue source côté front. Aucun bug visible.
- **Faux signal validé** : la dédup des villes utilise une normalisation lowercase + suppression d'accents. La borne 10 villes dans `uniqueCitiesConfirmed` protège l'explosion du document.
- **Anti-spam help** : id composite `${postId}_${helperId}` + rule `helpId == request.resource.data.postId + '_' + request.auth.uid` ⇒ impossible de doubler côté API directe.

## Évolutions possibles (Phase 2)

1. **Onglet "Mes posts B2B" dans le Dashboard vendeur** — utile pour gérer les helps reçus et fermer un post résolu.
2. **Bouton admin "Relancer la traduction"** pour les posts en `failed`.
3. **Push matching catégorie** — quand un vendeur Pro/Grossiste publie un post, notifier les autres vendeurs Pro de la même catégorie + pays (réutiliser le pipeline `notify-buyer-request-match`).
4. **Algolia indexing** — ajout des posts B2B dans Algolia pour la recherche full-text multi-langue.
5. **Cron de purge** des posts `closed` plus vieux que 90 jours.
6. **Réputation décroissante** dans le temps pour valoriser l'activité récente.
