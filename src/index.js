const { Client, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const config = require('../config.json');
const database = require('./database.js');
const api = require('./api.js');

const TOKEN = process.env.TOKEN;

const interactions = [
  {
    name: 'menu',
    chat: true,
    description: 'create options panel',
    args: [],
    handler: async ({ channel }) => {
      channel.send({
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                label: 'Add Course',
                style: 1,
                custom_id: 'add-button',
              },
              {
                type: 2,
                label: 'Remove Course',
                style: 1,
                custom_id: 'remove-button',
              },
              {
                type: 2,
                label: 'Status',
                style: 1,
                custom_id: 'status-button',
              },
            ],
          },
        ],
      });

      return {
        type: 'reply',
        data: {
          content: 'done',
          ephemeral: true,
        },
      };
    },
  },
  {
    name: 'set',
    chat: true,
    description: 'set channel as announcements channel',
    args: [],
    handler: async ({ channel }) => {
      database.setConfig({ key: 'channel', value: channel.id });

      return {
        type: 'reply',
        data: {
          content: 'done',
          ephemeral: true,
        },
      };
    },
  },
  {
    name: 'add-button',
    chat: false,
    handler: async () => {
      return {
        type: 'modal',
        data: {
          customId: 'add-modal',
          title: 'Add CRN',
          components: [
            {
              type: 1,
              components: [
                {
                  type: 4,
                  customId: 'add-input',
                  style: 1,
                  label: 'CRN',
                  required: true,
                  placeholder: 'CRN',
                },
              ],
            },
          ],
        },
      };
    },
  },
  {
    name: 'remove-button',
    chat: false,
    handler: async ({ user }) => {
      const courses = database.getUserCourses(user.id);
      const data = !courses.length
        ? { content: 'no courses added!' }
        : {
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 3,
                    custom_id: 'remove-menu',
                    options: courses.map((course) => ({
                      label: course.crn,
                      value: course.crn,
                    })),
                  },
                ],
              },
            ],
          };

      return {
        type: 'reply',
        data: { ...data, ephemeral: true },
      };
    },
  },
  {
    name: 'status-button',
    chat: false,
    handler: async ({ user }) => {
      const ids = database.getUserCourses(user.id);

      const data = await Promise.all(
        ids.map(async ({ crn: id }) => {
          const info = await api.info(id);
          if (info === undefined) return '';

          const headings = [
            ['Capacity', 'capacity'],
            ['Actual', 'actual'],
            ['Remaining', 'remaining'],
          ];

          const sections = [
            ['Registration', 'seats'],
            ['Waitlist', 'waitlist'],
          ];

          const stats = sections
            .map(([sectionName, sectionProp]) =>
              headings
                .map(
                  ([headingName, headingProp]) =>
                    `${sectionName} ${headingName}: ` +
                    `${info[sectionProp][headingProp]}`
                )
                .join('\n')
            )
            .join('\n');

          return `${info.title}\n${stats}`;
        })
      );

      return {
        type: 'reply',
        data: {
          content: `\`\`\`${data.join('\n\n')}\`\`\``,
          ephemeral: true,
        },
      };
    },
  },
  {
    name: 'add-modal',
    chat: false,
    handler: async ({ data, user }) => {
      const id = data['add-input'];

      if (!/^\d+$/.test(id))
        return {
          type: 'reply',
          data: {
            content: 'crn must be numeric',
            ephemeral: true,
          },
        };

      if (!(await api.exists(id)))
        return {
          type: 'reply',
          data: {
            content: 'crn does not exist',
            ephemeral: true,
          },
        };

      try {
        database.addWatch(user.id, id);
      } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return { type: 'ack' };
        } else {
          return {
            type: 'reply',
            data: {
              content: 'there was an error.',
              ephemeral: true,
            },
          };
        }
      }

      return { type: 'ack' };
    },
  },
  {
    name: 'remove-menu',
    chat: false,
    handler: async ({ user, values }) => {
      for (const value of values) {
        database.removeWatch(user.id, value);
        if (!database.getCourseWatchers(value).length) {
          database.removeCourse(value);
        }
      }

      return {
        type: 'update',
        data: {
          content: 'removed',
          ephemeral: true,
          components: [],
        },
      };
    },
  },
];

// add the commands every time
// it's probably fine...
const rest = new REST({ version: 10 }).setToken(TOKEN);
const data = interactions
  .filter((interactions) => interactions.chat)
  .map(({ name, description, args }) => ({
    name,
    description,
    type: 1,
    options: args.map(({ name, description }) => ({
      name,
      description,
      type: 3,
      required: true,
    })),
  }));

rest.put(Routes.applicationGuildCommands(config.client, config.guild), {
  body: data,
});

const handlers = new Map(
  interactions.map(({ name, handler }) => [name, handler])
);

const client = new Client({ intents: [] });
client.login(TOKEN);

client.on('interactionCreate', async (interaction) => {
  const {
    channelId: channel,
    commandName: command,
    customId: id,
    options,
    fields,
    user,
    values,
  } = interaction;

  const chatData =
    options === undefined
      ? undefined
      : Object.fromEntries(
          options.data.map(({ name, value }) => [name, value])
        );

  const fieldData =
    fields === undefined
      ? undefined
      : Object.fromEntries(
          fields.fields.map((value, key) => [key, value.value])
        );

  const result = await handlers.get(command ?? id)?.({
    data: chatData ?? fieldData,
    channel: await client.channels.fetch(channel),
    user,
    values,
  });

  if (result !== undefined) {
    if (result.type === 'modal') {
      interaction.showModal(result.data);
    } else if (result.type === 'reply') {
      interaction.reply(result.data);
    } else if (result.type === 'ack') {
      interaction.deferUpdate();
    } else if (result.type === 'update') {
      interaction.update(result.data);
    }
  }
});

setInterval(async () => {
  const channelId = database.getConfig('channel');
  if (channelId === undefined) return;
  const channel = await client.channels.fetch(channelId.value);

  const courses = database.getAllCourses();
  for (const { crn: id, available } of courses) {
    const data = {};
    try {
      data.spots = Boolean(await api.addable(id));
    } catch {
      console.log(`error while fetching ${id}`);
      continue
    }

    if (Boolean(available) === data.spots) continue;
    database.setStatus({ crn: id, available: Number(data.spots) });

    const watchers = database.getCourseWatchers(id);
    const ping = watchers.map((entry) => `<@${entry.user}>`).join('');
    if (data.spots) {
      await channel.send(`Class ${id} can be added!\n${ping}`);
    } else {
      await channel.send(`Class ${id} is no longer addable.\n${ping}`);
    }
  }
}, config.poll)
