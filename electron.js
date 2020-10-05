/**
 * Plugin Mél Electron
 *
 * Plugin d'affichage de Mél dans un client Electron en lien avec le plugin Mél_archivage
 * Les messages sont téléchargés sur le poste de l'utilisateur
 * Puis copié dans un dossier configuré dans 'Mails archive' 
 * Du dossier de l'application Electron 
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 2
 * as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */
if (window.api) {
  rcmail.addEventListener('init', function (evt) {
    if (rcmail.env.iselectron) {
      if (window.api) {
        window.api.send('get_archive_folder')
        window.api.receive('archive_folder', (folder) => {
          rcmail.env.local_archive_folder = folder;
          createFolder();
          displaySubfolder();
        });
      }

    }
  });

  //  ----- Réaffiche les sous-dossier après archivage d'un nouveau dossier -----
  window.api.receive('new_folder', (folder) => {
    displaySubfolder();
  })

  // ----- Ajout des mails dans la liste après archivage -----
  window.api.receive('add_message_row', (row) => {
    addMessageRow(row, rcmail.env.local_archive_folder + "/" + row.mbox)
  })

  // ----- Avancement de l'archivage -----
  let message_archivage = '';
  window.api.receive('download-advancement', (data) => {
    rcmail.hide_message(message_archivage);
    message_archivage = rcmail.display_message(`Nombre de mails restants : ${data.length}`, 'loading');
    
    if (data.uid) {
      let mail_data = rcmail.params_from_uid(data.uid)
      rcmail.http_post('mail/delete', {
        _mbox: mail_data._mbox,
        _uid: mail_data._uid,
      });
    }
  })

  // ----- Suppression des mails après archivage -----
  window.parent.api.receive('download-finish', (files) => {
    rcmail.hide_message(message_archivage);
    rcmail.display_message('Fin du téléchargement des archives', 'confirmation');
  });

  // -----Affiche le dossier des archives -----
  function createFolder() {
    let link = $('<a>').attr('href', '#')
      .attr('rel', rcmail.env.local_archive_folder)
      .attr('onClick', "chargementArchivage('')")
      .html(rcmail.env.local_archive_folder);

    rcmail.treelist.insert({ id: rcmail.env.local_archive_folder, html: link, classes: ['mailbox archives_locales'] });
    if ($("li.trash").length) {
      $("li.archives_locales").detach().insertAfter($("li.trash"));
    }
  }

  // ----- Affiche les sous-dossier des archives -----
  function displaySubfolder() {
    window.api.send('subfolder');
    window.api.receive('listSubfolder', (subfolders) => {
      subfolders.forEach(subfolder => {
        if (subfolder.name == rcmail.env.username) {
          subfolder.relativePath = '';
          getChildren(subfolder);
        }
      })
    });
  }
  function getChildren(parent) {
    if (parent && parent.children) {
      for (var i = 0, l = parent.children.length; i < l; ++i) {
        var child = parent.children[i];
        child.relativePath = child.relativePath.replace(/\\/g, "/");
        let key = child.relativePath;
        let link = $('<a>').attr('href', '#')
          .attr('rel', key)
          .attr('onClick', "chargementArchivage('" + key + "')")
          .html(translateFolder(child.name));
          //On ignore le dossier de l'utilisateur
          if (parent.relativePath == "") {
            rcmail.treelist.insert({ id: rcmail.env.local_archive_folder + '/' + key, html: link, classes: ['mailbox'] }, rcmail.env.local_archive_folder, 'mailbox');            
          }
          //On insère les dossiers sous le dossier principal
          else {
            rcmail.treelist.insert({ id: rcmail.env.local_archive_folder + '/' + key, html: link, classes: ['mailbox'] }, rcmail.env.local_archive_folder + '/' + parent.relativePath, 'mailbox');
          }
        getChildren(child);
      }
    }
  }

  // ----- Changement de l'environnement et chargement de la liste  ----- 
  function chargementArchivage(path) {
    mbox = (path == '') ? rcmail.env.local_archive_folder : rcmail.env.local_archive_folder + "/" + path;
    rcmail.env.mailbox = mbox;

    loadArchive(path);

    //Système de recherche des mails
    $("[name ='rcmqsearchform']").removeAttr('onsubmit').submit(function (e) {
      e.preventDefault();
      window.api.send('search_list', { "value": $('#quicksearchbox').val(), "subfolder": rcmail.env.mailbox.replace(rcmail.env.local_archive_folder + "/", "") });
      window.api.receive('result_search', (rows) => {
        rcmail.message_list.clear();
        if (rows.length > 0) {
          rows.forEach(row => {
            if (row.break == 0) {
              addMessageRow(row, rcmail.env.local_archive_folder + "/" + row.subfolder);
            }
          });
        }
        else {
          if (rows.break == 0) {
            addMessageRow(rows, rcmail.env.local_archive_folder + "/" + row.subfolder);
          }
        }
      });
    });

    $("#searchreset").on('click', function (e) {
      e.preventDefault();
      rcmail.message_list.clear();
      loadArchive(path);
    });
  }

  // ----- Affiche la liste des messages d'un dossier -----
  function loadArchive(path) {
    window.api.send('read_mail_dir', path)
    window.api.receive('mail_dir', (mails) => {
      mails.forEach((mail) => {
        if (mail.break == 0) {
          addMessageRow(mail, mbox);
        }
      });

      read_unread();
      flag_unflagged();
    })
    if (rcmail.message_list) {
      rcmail.message_list.clear();
      delete rcmail.message_list._events;

      rcmail.message_list.addEventListener('select', function (list) {
        let uid = list.get_single_selection();

        if (uid == null && rcmail.env.mailbox != rcmail.env.local_archive_folder) {
          document.location.reload();
        }

        //Premier index de message_list = MA au lieu de 0
        if (uid == "MA") {
          uid = 0;
        }
        window.api.send('mail_select', uid)

        document.body.classList.add('busy-cursor');
        window.api.receive('mail_return', (mail) => {
          let body = $("#mainscreen").contents().find('#mailview-bottom');
          body.html(mail);
          document.body.classList.remove('busy-cursor');
        });
      });



    }
  };

}

function openAttachment(uid, partid) {
  document.body.classList.add('busy-cursor');
  window.api.send('attachment_select', { 'uid': uid, 'partid': partid })

  window.api.receive('busy-loader', () => {
    document.body.classList.remove('busy-cursor');
  });
}

function addMessageRow(row, mbox) {
  row.date = new Date(row.date).toLocaleString('fr-FR', { timeZone: 'UTC' });
  let etiquettes = JSON.parse(row.etiquettes);
  let seen = etiquettes.SEEN ? 1 : 0;
  let flagged = etiquettes.FLAGGED ? 1 : 0;
  let flags = { "flagged": flagged, "seen": seen, "ctype": row.content_type, "mbox": mbox };
  rcmail.add_message_row(row.id, row, flags, false);
}

//Gestion des lus/non lus
function read_unread() {
  $("span[id*='msgicnrcmrow']").unbind('click');
  $("span[id*='msgicnrcmrow']").click(function () {
    let seen = $(this).hasClass('unread') ? true : false;
    let flagged = $(this).closest('tr').hasClass('flagged') ? true : false;
    $(this).toggleClass('unread');
    $(this).closest('tr').toggleClass('unread');
    let uid = $(this).next().attr('href').split('&')[2].split('=')[1];
    window.api.send('read_unread', { "uid": uid, "SEEN": seen, "FLAGGED": flagged });
    rcmail.display_message('Courriels marqués avec succès', 'confirmation');
  })
}

//Gestion des flags
function flag_unflagged() {
  $("span[id*='flagicnrcmrow']").unbind('click');
  $("span[id*='flagicnrcmrow']").click(function () {
    let flagged = $(this).hasClass('flagged') ? false : true;
    if (!flagged) {
      $(this).addClass('unflagged').removeClass('flagged');
    }
    else {
      $(this).addClass('flagged').removeClass('unflagged');
    }
    $(this).closest('tr').toggleClass('flagged');

    let seen = $(this).closest('tr').hasClass('unread') ? false : true;

    let uid = $(this).closest('tr').find('a').attr('href').split('&')[2].split('=')[1];
    window.api.send('flag_unflagged', { "uid": uid, "SEEN": seen, "FLAGGED": flagged });
    rcmail.display_message('Courriels marqués avec succès', 'confirmation');
  })
}

function translateFolder(name) {
  switch (name) {
    case 'INBOX':
      return 'Boite de réception'
    case 'Drafts':
      return 'Brouillons'
    case 'Sent':
      return 'Envoyés'
    case 'Trash':
      return 'Corbeille'
    case 'Junk':
      return 'Indésirable'
    case 'Templates':
      return 'Modèles'
    default:
      return name;
  }
}
