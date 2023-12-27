/** Language text */
export const lang = {
  code: "fr-FR",
  system: "Système",
  server_started: "a démarré le serveur",
  fetched_netatmo_data: "a récupéré les données de la station météo",
  refreshed_netatmo_token: "a rafrachit le token de récupération des données de la station météo",
  user_already_exists: "Cet utilisateur existe déjà",
  user_does_not_exist: "Cet utilisateur n'existe pas",
  user_created: "a été crée",
  user_deleted: "a été supprimé",
  user_password_updated: "a eu son mot de passe réinitalisé par ${actor}",
  user_roles_updated: "a été mis à jour par ${actor} avec les roles suivants: [${roles}]",
  login_failed: "Utilisateur ou mot de passe incorrect",
  history_hidden_username: "Un utilisateur",
  forbidden: "Action interdite",
  bad_request: "Requête invalide",
  action_does_not_exist: "Action inconnue",
  action_enabled: "a activé ${target}",
  action_disabled: "a désactivé ${target}",
  action_photo_taken: "a pris une photo",
  bad_duration: "Durée invalide",
  action_on: "a allumé ${target} pour ${duration}",
  action_off: "a éteint ${target}",
  action_off_auto: "a éteint automatiquement ${target} allumé par ${actor} après ${duration}",
  action_on_until: "Actif jusque",
  action_is_disabled: "Action désactivée",
  action_conditions_updated: "a mis à jour les conditions d'activation de ${target}",
  bad_dates: "Dates invalides",
  bad_stat: "Stat invalide",
  bad_op: "Comparateur invalide",
  bad_value: "Valeur invalide",
  light: "les lumières",
  heat: "le chauffage",
  aeration: "l'aération",
  water: "l'arrosage",
  video: "la caméra",
  camera: "l'appareil photo",
  light_name: "Lumières",
  heat_name: "Chauffage",
  aeration_name: "Aération",
  water_name: "Arrosage",
  video_name: "Vidéo",
  camera_name: "Photo",
  temperature: "Température",
  humidity: "Humidité",
  temperature_out: "Température extérieure",
  humidity_out: "Humidité extérieure",
  co2: "CO2",
  pressure: "Pression atmosphérique",
  noise: "Bruit",
  rain: "Pluie",
  windstrength: "Vent",
  guststrength: "Rafales",
  illuminance: "Éclairement lumineux",
  logout: "Déconnexion",
  login: "Connexion",
  username: "Nom d'utilisateur",
  password: "Mot de passe",
  automated_handling: "Gestion automatisée",
  automated_handling_description:
    "L'action sera automatiquement executée au prochain raffraichissement des données (toutes les 30 minutes) lorsqu'au moins un des ensembles de conditions ci-dessous satisfait",
  manual_handling: "Gestion manuelle",
  manual_handling_description: "Allumer ou éteindre manuellement l'action (passe outre la gestion automatique)",
  manual_start: "Démarrage manuel",
  manual_stop: "Arrêt manuel",
  action_manage: "Gérer cette action",
  action_manage_description:
    "Activer ou désactiver l'action. Lorsque l'action est désactivée, elle reste éteinte et ne pourra plus être allumée soit par la gestion automatique ou manuelle, à moins d'être réactivée à nouveau",
  enable: "Activer",
  disable: "Désactiver",
  once: "Une fois",
  "1m": "Pendant 1 minute",
  "5m": "Pendant 5 minutes",
  "10m": "Pendant 10 minutes",
  "15m": "Pendant 15 minutes",
  "30m": "Pendant 30 minutes",
  "1h": "Pendant 1 heure",
  "2h": "Pendant 2 heures",
  "3h": "Pendant 3 heures",
  "4h": "Pendant 4 heures",
  "5h": "Pendant 5 heures",
  "6h": "Pendant 6 heures",
  "7h": "Pendant 7 heures",
  "8h": "Pendant 8 heures",
  "9h": "Pendant 9 heures",
  "10h": "Pendant 10 heures",
  "11h": "Pendant 11 heures",
  "12h": "Pendant 12 heures",
  time: "Horaire",
  history: "Historique",
  history_entry_by: "Initié par",
  history_entry_action: "Action",
  history_entry_date: "Date",
  users_manage: "Gestion des utilisateurs",
  users_manage_description:
    "Ajouter, modifier ou supprimer des utilisateurs. Les utilisateurs administrateurs ont tous les accès. Les utilisateurs avec les accès systèmes peuvent voir et modifier divers réglages, notamment la visibilité publique de certaines données. Les utilisateurs avec les accès utilisateurs peuvent ajouter, supprimer et gérer les roles des utilisateurs. Les utilisateurs avec les accès actionneurs peuvent activer, désactiver et modifier la configuration des actionneurs.",
  users_name: "Utilisateur",
  users_is_admin: "Administrateur",
  users_can_manage_system: "Gérer le système",
  users_can_manage_users: "Gérer les utilisateurs",
  users_can_manage_actions: "Gérer les actionneurs",
  users_last_login: "Dernière connexion",
  users_never_logged: "Jamais connecté",
  users_actions: "Actions",
  edit: "Modifier",
  delete: "Supprimer",
  create: "Créer",
  roles: "Roles",
  roles_description: "Cet utilisateur a les roles suivants :",
  change_password: "Changer le mot de passe",
  change_password_description: "Il est conseillé de choisir un mot de passe sécurisé en combinant des lettres, des chiffres et des caractères spéciaux",
  password_initial: "Mot de passe initial",
  password_new: "Nouveau mot de passe",
  password_confirm: "Confirmer le nouveau mot de passe",
  last_updated: "Mis à jour le",
  next_update: "Prochaine mise à jour le",
  date_from: "Du",
  date_to: "à",
  user_manage: "Gestion du compte",
  user_manage_description: "Gérer ",
  system_manage: "Gestion du système",
  system_manage_description: "Gérer",
  system_general: "Général",
  system_autologout: "Déconnexion automatique après",
  system_autologout_description: "Les sessions utilisateurs expireront automatiquement après le nombre de jours spécifié",
  day: "jour(s)",
  system_public: "Visibilité des données",
  system_public_stats: "Données et graphes météo publics",
  system_public_stats_description: "Rendre accessible les données et graphes météo même aux utilisateurs non connectés",
  system_public_actions: "État des actionneurs publics",
  system_public_actions_description: "Rendre visible l'état ainsi que les conditions d'activation des actionneurs même aux utilisateurs non connectés (les actionneurs resteront immuables)",
  system_public_history: "Historique public",
  system_public_history_description: "Rendre visible l'historique même aux utilisateurs non connectés (les noms des utilisateurs seront masqués)",
  system_public_images: "Dernière photo prise publique",
  system_public_images_description: "Rendre visible la dernière photo prise par la caméra même aux utilisateurs non connectés",
  system_public_video: "Vidéo en temps réel publique",
  system_public_video_description: "Rendre visible la vidéo en temps réel même aux utilisateurs non connectés (n'a aucun effet si la caméra est désactivée)",
  system_modules: "Modules",
  system_modules_description:
    "Aperçu des modules configurés. Pour connecter un nouveau module, ajoutez-le au réseau local et récupérer son addresse MAC et son addresse IP pour l'enregistrer dans le fichier de configuration /gardenia/settings.jsonc puis redémarrez le service ou redémarrer le serveur",
  system_modules_type: "Module",
  system_modules_indoor: "Station intéreure",
  system_modules_outdoor: "Station extérieure",
  system_modules_rain: "Pluviomètre",
  system_modules_wind: "Anémomètre",
  system_modules_plug: "Prise connectée",
  system_modules_ip: "Adresse IP",
  system_modules_mac: "Adresse MAC",
  unknown_error: "Une erreur s'est produite",
  done: "C'est fait !",
  system_default_values_set: "a initialisé les valeurs par défaut du système",
  system_updated: "a mis à jour la configuration système",
  stream_not_found: "Flux vidéo non trouvé",
  conditions: "Si toutes les conditions suivantes sont satisfaites :",
  conditions_add_one: "Ajouter une condition",
  conditions_add_set: "Ajouter des conditions",
  conditions_le: "inférieur(e) à",
  conditions_ge: "supérieur(e) à",
  conditions_eq: "égal(e) à",
  conditions_turn_on: "Démarrer",
  outdoor: "en extérieur",
  gust: "en rafales",
}
