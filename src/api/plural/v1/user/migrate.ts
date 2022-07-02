import { firestore } from "firebase-admin";
import { logger, userLog } from "../../../../modules/logger";
import { getCollection } from "../../../../modules/mongo";
import { SimplyPluralDb } from "../../../../util/types";

const convertTime = (data: { [field: string]: any }) => {
	if (!data) return;
	for (const key in data) {
		if (data[key]) {
			if (Object.keys(data[key]).includes("_seconds")) {
				const newValue = data[key]["_seconds"] * 1000 + data[key]["_nanoseconds"] / 10000000;
				data[key] = Math.round(newValue);
			}
		}
	}
};

export const createUser = async (uid: string) => {
	const serverUser = await getCollection("serverData", SimplyPluralDb).findOne({ uid: uid });
	if (!serverUser || (serverUser?.migrated === false)) {
		const pubMembers = await firestore().collection("users").doc(uid).collection("publicMembers").get();

		const privMembers = await firestore().collection("users").doc(uid).collection("privateMembers").get();

		const notes = await firestore().collection("users").doc(uid).collection("notes").get();
		const frontHistory = await firestore().collection("users").doc(uid).collection("frontHistory").get();

		const polls = await firestore().collection("users").doc(uid).collection("polls").get();

		const frontStatuses = await firestore().collection("users").doc(uid).collection("frontStatuses").get();

		const fronters = await firestore().collection("users").doc(uid).collection("fronters").get();

		const groups = await firestore().collection("users").doc(uid).collection("groups").get();

		const shared = await firestore().collection("users").doc(uid).collection("shared").doc("fronters").get();

		const privateDoc = await firestore().collection("users").doc(uid).collection("private").doc("data").get();

		const user = await firestore().collection("users").doc(uid).get();

		const membersBatch: any[] = [];
		{
			privMembers.docs.forEach((doc): any => {
				const data = doc.data();
				data._id = doc.id;
				data.uid = uid;
				data["private"] = true;
				convertTime(data);
				membersBatch.push(data);
			});

			pubMembers.docs.forEach((doc): any => {
				const data = doc.data();
				data._id = doc.id;

				if (!membersBatch.includes({ _id: doc.id })) {
					data.uid = uid;
					data["private"] = false;
					convertTime(data);
					membersBatch.push(data);
				}
			});
		}
		const notesBatch: any[] = [];
		{
			notes.docs.forEach((doc) => {
				const data = doc.data();
				data._id = doc.id;
				data.uid = uid;
				convertTime(data);
				notesBatch.push(data);
			});
		}
		const frontHistoryBatch: any[] = [];
		{
			frontHistory.docs.forEach((doc) => {
				const data = doc.data();
				data._id = doc.id;
				data.uid = uid;
				convertTime(data);
				frontHistoryBatch.push(data);
			});
		}
		const pollsBatch: any[] = [];
		{
			polls.docs.forEach((doc) => {
				const data = doc.data();
				data._id = doc.id;
				data.uid = uid;
				convertTime(data);
				pollsBatch.push(data);
			});
		}

		const frontStatusesBatch: any[] = [];
		{
			frontStatuses.docs.forEach((doc) => {
				const data = doc.data();
				data._id = doc.id;
				data.uid = uid;
				convertTime(data);
				frontStatusesBatch.push(data);
			});
		}
		const frontersBatch: any[] = [];
		{
			fronters.docs.forEach((doc) => {
				const data = doc.data();
				data._id = doc.id;
				data.uid = uid;
				convertTime(data);
				frontersBatch.push(data);
			});
		}
		const groupsBatch: any[] = [];
		{
			groups.docs.forEach((doc) => {
				const data = doc.data();
				data._id = doc.id;
				data.uid = uid;
				convertTime(data);
				groupsBatch.push(data);
			});
		}

		let data: { [field: string]: any } = privateDoc.data()!;
		if (data == null) {
			data = {};
		}

		data["latestVersion"] = 76;
		data["uid"] = uid;
		data["_id"] = uid;

		if (membersBatch.length > 0) getCollection("members", SimplyPluralDb).insertMany(membersBatch);
		if (notesBatch.length > 0) getCollection("notes", SimplyPluralDb).insertMany(notesBatch);
		if (frontHistoryBatch.length > 0) getCollection("frontHistory", SimplyPluralDb).insertMany(frontHistoryBatch);
		if (pollsBatch.length > 0) getCollection("polls", SimplyPluralDb).insertMany(pollsBatch);
		if (frontStatusesBatch.length > 0) getCollection("frontStatuses", SimplyPluralDb).insertMany(frontStatusesBatch);
		if (frontersBatch.length > 0) getCollection("fronters", SimplyPluralDb).insertMany(frontersBatch);
		if (groupsBatch.length > 0) getCollection("groups", SimplyPluralDb).insertMany(groupsBatch);

		await getCollection("private", SimplyPluralDb).updateOne({ _id: uid, uid: uid }, { $set: data }, { upsert: true });

		let userData: { [field: string]: any } = user.data()!;
		if (!userData) {
			userData = {};
		}

		userData["isAsystem"] = data["isAsystem"] != null ? data["isAsystem"] : true;
		userData["fromFirebase"] = true;
		userData["uid"] = uid;
		userData["_id"] = uid;

		let sharedData: { [field: string]: any } = shared.data()!;
		if (!sharedData) {
			sharedData = {};
		}

		sharedData["uid"] = uid;
		sharedData["_id"] = uid;

		await getCollection("sharedFront", SimplyPluralDb)
			.updateOne({ _id: uid, uid: uid }, { $set: sharedData }, { upsert: true });
		await getCollection("users",SimplyPluralDb).updateOne({ _id: uid, uid: uid }, { $set: userData }, { upsert: true });

		const friends = await firestore().collection("users").doc(uid).collection("friends").get();

		for (let i = 0; i < friends.size; ++i) {
			const friend = friends.docs[i];
			const foundUser = await getCollection("users", SimplyPluralDb).findOne({ uid: friend.id });
			if (foundUser) {
				const otherFriendSettings = await firestore().collection("users").doc(friend.id).collection("friends").doc(uid).get();
				if (!otherFriendSettings) {
					await getCollection("friends", SimplyPluralDb)
						.updateOne(
							{ uid: friend.id, frienduid: uid },
							{
								$set: {
									uid: friend.id,
									frienduid: uid,
									getFrontNotif: false,
									getTheirFrontNotif: false,
									seeFront: false,
									seeMembers: false,
								},
							},
							{ upsert: true }
						)
						.catch((e) => logger.error(e));
				} else {
					{
						const { getFrontNotif, getTheirFrontNotif, seeFront, seeMembers } = otherFriendSettings.data()!;
						await getCollection("friends", SimplyPluralDb)
							.updateOne(
								{ uid: friend.id, frienduid: uid },
								{
									$set: {
										uid: friend.id,
										frienduid: uid,
										getFrontNotif: getFrontNotif,
										getTheirFrontNotif: getTheirFrontNotif,
										seeFront: seeFront,
										seeMembers: seeMembers,
									},
								},
								{ upsert: true }
							)
							.catch((e) => logger.error(e));
					}
				}
				{
					const { getFrontNotif, getTheirFrontNotif, seeFront, seeMembers } = friend.data();

					await getCollection("friends", SimplyPluralDb)
						.updateOne(
							{ uid: uid, frienduid: friend.id },
							{
								$set: {
									uid: uid,
									frienduid: friend.id,
									getFrontNotif: getFrontNotif,
									getTheirFrontNotif: getTheirFrontNotif,
									seeFront: seeFront,
									seeMembers: seeMembers,
								},
							},
							{ upsert: true }
						)
						.catch((e) => logger.error(e));
				}

				//notifyUser(friend.id, "Friend migrated", self.username)
			}
		}
	}

	userLog(uid, "Migrated");

	getCollection("serverData", SimplyPluralDb)
		.updateOne({ uid: uid }, { $set: { migrated: true } }, { upsert: true });
};
