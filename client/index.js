document.documentElement.setAttribute('data-bs-theme', (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    document.documentElement.setAttribute('data-bs-theme', (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
});

const urlUser = "/api/user";

//get user info
async function getUser() {
    const response = await fetch(urlUser, {
        method: "GET"
    });

    if (response.ok) {
        const user = await response.json();
        return user;
    }

    if (response.status === 401) {
        return undefined;
    }

    throw new Error("An issue occured while obtaining user information");
}


function getRecordsFromLocalStorage() {
    const itemArray = localStorage.getItem("items");
    return itemArray ? JSON.parse(itemArray) : [];
}

async function getItems() {
    let records;
    if (repo) {
        records = await repo.get();
    } else {
        records = getRecordsFromLocalStorage();
    }

    return records;
}



async function putRecord(id, item) {
    for (const record of records) {
        if (record.id === id) {
            record.title = item.title;
            record.is_completed = item.is_completed;
            break;
        }
    }

    if (repo) {
        await repo.update(id, item);
    }
    else {
        saveLocalStorage(records)
    }
}

function saveLocalStorage(items) {
    localStorage.setItem("items", JSON.stringify(items));
}

async function postRecord(item) {
    let newItem;

    if (repo) {
        newItem = await repo.save(item);

        records.push(newItem);
    } else {
        newItem = {
            id: records.length === 0 ? 0 : records[records.length - 1].id + 1,
            title: item.title,
            is_completed: false
        }

        records.push(newItem);

        saveLocalStorage(records);
    }

    return newItem;
}


async function deleteRecord(id) {
    for (const record of records) {
        if (record.id === id) {
            records.splice(records.indexOf(record), 1);
        }
    }

    if (repo) {
        await repo.delete(id);
    } else {
        saveLocalStorage(records);
    }
}

function createItem(item) {
    //create checkbox
    const checkbox = document.createElement("input");
    checkbox.classList.add("form-check-input", "me-1");
    checkbox.setAttribute("type", "checkbox");
    checkbox.checked = item.is_completed;
    checkbox.id = item.id;

    //create to do part
    const toDo = document.createElement("div");
    toDo.textContent = item.title;
    toDo.contentEditable = true;
    toDo.classList.add("form-control", "bg-transparent", "shadow-none", "text-wrap", "overflow-hidden", "border-0");

    //create delete button
    const deleteButton = document.createElement("button");
    deleteButton.classList.add("btn", "btn-light", "px-1", "py-0");
    deleteButton.innerHTML = '<i class="bi bi-trash3-fill"></i>';

    //create list card div
    const listCard = document.createElement("li");
    listCard.classList.add("list-group-item", "d-flex", "justify-content-between", "border", "border-0", "border-bottom", "align-items-center", "gap-3");

    //append left and right part in list card div
    listCard.append(checkbox, toDo, deleteButton);

    //update the list card with is_complete
    checkbox.onchange = createOnCheckBoxInputChange(item, toDo, listCard, deleteButton);
    if (item.is_completed) {
        toDo.classList.add("text-decoration-line-through", "text-body-tertiary");
        listCard.classList.add("bg-secondary-subtle");
        toDo.contentEditable = false;
    } else {
        toDo.classList.remove("text-decoration-line-through", "text-body-tertiary");
        listCard.classList.remove("bg-secondary-subtle");
        toDo.contentEditable = true;
    }

    //asigning delete function to delete button 
    deleteButton.onclick = createOnClickDelete(item, listCard, deleteButton);

    //getting the editted title
    toDo.onblur = createOnToDoBlur(item, toDo);

    return listCard;
}

async function onClickAddNote() {
    const input = document.getElementById("new-note");
    const title = input.textContent;
    if (!title || title.length === 0) {
        alert("There is nothing to be added");
        return;
    }
    const newItem = {
        title,
    };

    const newNote = await postRecord(newItem);

    lists.append(createItem(newNote));


    document.getElementById("new-note").textContent = "";
}

function onNewNoteKeyDown(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent the default action (like a newline in the textarea)
        onClickAddNote(); // Call the function to add a note
    }
}

function createOnCheckBoxInputChange(item, toDo, listCard) {
    return async function (event) {
        let updated = {};
        if (event.currentTarget.checked) {
            updated = {
                title: item.title,
                is_completed: true
            }
            toDo.classList.add("text-decoration-line-through", "text-body-tertiary");
            listCard.classList.add("bg-secondary-subtle");
            toDo.contentEditable = false;
        } else {
            updated = {
                title: item.title,
                is_completed: false
            }
            toDo.classList.remove("text-decoration-line-through", "text-body-tertiary");
            listCard.classList.remove("bg-secondary-subtle");
            toDo.contentEditable = true;
        }

        await putRecord(item.id, updated);
    }
}

function createOnClickDelete(item, listCard, deleteButton) {
    return async function () {
        deleteButton.disabled = true;
        await deleteRecord(item.id)
        listCard.remove();

        // } else {
        //     alert("The item cannot be deleted");
        //     deleteButton.disabled = false;
        // }
    }
}

function createOnToDoBlur(item, toDo) {
    return async function () {
        if (!toDo.textContent || toDo.textContent.length === 0) {
            await deleteRecord(item.id);

            lists.innerHTML = "";
            for (const record of records) {
                lists.append(createItem(record));

            }
        } else {
            const updated = {
                title: toDo.textContent,
                is_completed: item.is_completed
            }
            await putRecord(item.id, updated);
        }
    }
}

async function toggleSignInOut() {
    if (user) {
        const img = document.getElementById("user-img");
        img.setAttribute("src", user.picture);
        const signOut = document.getElementById("sign-out");
        signOut.classList.remove("d-none");
    } else {
        const signIn = document.getElementById("sign-in");
        signIn.classList.remove("d-none");
    }
}

//debounce
let searchTimeOutId;
function onSearchKeyUp(event) {
    if (searchTimeOutId) {
        clearTimeout(searchTimeOutId);
        searchTimeOutId = undefined;
    }
    const searchedItem = event.currentTarget.value;

    searchTimeOutId = setTimeout(async () => {
        lists.innerHTML = "";
        for (const record of records) {
            if (!searchedItem || searchedItem.length === 0 || record.title.toLowerCase().includes(searchedItem.toLowerCase())) {
                lists.append(createItem(record));
            }
        }

    }, 400);
}

function onClickSignIn() {
    if (getRecordsFromLocalStorage().length > 0) {
        const myModal = new bootstrap.Modal(document.getElementById('exampleModal'));
        myModal.show();
    } else {
        location.href = "/login";
    }
}

function onDiscardTasks() {
    location.href = "/login";
    localStorage.clear();
}

function onSaveTasksToAccount() {
    location.href = "/login";
}

async function postLocalToApi() {
    const tasks = getRecordsFromLocalStorage().map(item => ({ title: item.title, is_completed: item.is_completed }));
    console.log(tasks);
    for (const task of tasks) {
        taskFromLocal = await repo.save(task);
    }
}

async function deleteAccount(){
    if(!confirm("Are you sure you want to delete your account? This action cannot be undone.")){
        return;
    }
    const response = await fetch(urlUser, {
        method: "DELETE"
    });

    if (response.ok) {
        location.href = "/logout";
    }
}

let records;
let lists;
let user;
let repo;

window.onload = () => {
    document.getElementById('new-note').textContent = "";
    document.getElementById('footer').classList.remove('d-none');
}

window.onpageshow = async () => {
    lists = document.getElementById("lists");
    lists.innerHTML = "";
    user = await getUser();
    if (user) {
        repo = new RecordsRepositoryApi();
        if (localStorage.getItem("items")) {
            await postLocalToApi();
            localStorage.removeItem("items");
        }
    }
    toggleSignInOut();

    records = await getItems();
    console.log(records);
    for (const record of records) {
        lists.append(createItem(record));
    }

}